import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken, setAuthCookie } from '@/lib/auth'
import { consumeVerification } from '@/lib/phone-verification'

export async function POST(req: NextRequest) {
  const body = await req.json()
  // И-мэйл авахгүй — утсаа SMS-ээр баталгаажуулж бүртгүүлнэ, нууц үгээ утсаар сэргээнэ
  const { name, phone, password, cargoId } = body

  if (!name || !phone || !password || !cargoId) {
    return NextResponse.json({ error: 'Бүх талбарыг бөглөнө үү' }, { status: 400 })
  }

  const cargo = await prisma.cargo.findUnique({ where: { id: Number(cargoId) } })
  if (!cargo) {
    return NextResponse.json({ error: 'Карго олдсонгүй' }, { status: 400 })
  }

  const byPhone = await prisma.user.findUnique({ where: { phone } })

  if (byPhone) {
    if (byPhone.cargoId === cargo.id) {
      return NextResponse.json({ error: 'Энэ утасны дугаар бүртгэлтэй байна' }, { status: 409 })
    }
    // Тухайн утас өөр каргод бүртгэлтэй байна — зөвхөн энгийн хэрэглэгчийн бүртгэлийг
    // и-мэйлээр баталгаажуулаад шилжүүлж болно (админ/супер эрхийг энд шилжүүлэхгүй)
    if (byPhone.role !== 'USER') {
      return NextResponse.json({ error: 'Энэ утасны дугаар бүртгэлтэй байна' }, { status: 409 })
    }
    const masked = byPhone.email ? byPhone.email.replace(/^(.).*(@.*)$/, '$1***$2') : null
    return NextResponse.json({ error: 'NEEDS_MOVE', code: 'NEEDS_MOVE', maskedEmail: masked }, { status: 409 })
  }

  // Шинэ хэрэглэгч бүр утсаа Verify.MN-ээр баталгаажуулсан байх ёстой — эс тэгвэл бусдын дугаараар
  // бүртгүүлж тэр дугаарын ачааг авах боломжтой. Бусад шалгалт давсны дараа хэрэглэнэ
  // (өөр талбарын алдаанаас болж хэрэглэгчийн төлсөн SMS шатахгүй).
  if (!(await consumeVerification(String(body.verificationId ?? ''), String(phone)))) {
    return NextResponse.json({ error: 'Утасны дугаараа баталгаажуулна уу' }, { status: 400 })
  }

  const hashed = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { name, phone, password: hashed, cargoId: cargo.id, phoneVerifiedAt: new Date() },
  })

  // Auto-link any existing shipments with this phone in this cargo.
  // updatedAt-ыг хөдөлгөхгүй (raw SQL) — олгосон ачаанд энэ нь олгосон огноо
  await prisma.$executeRaw`
    UPDATE "Shipment" SET "userId" = ${user.id}
    WHERE "phone" = ${phone} AND "userId" IS NULL AND "cargoId" = ${cargo.id}`

  const token = signToken({ userId: user.id, role: user.role, cargoId: user.cargoId })
  const res = NextResponse.json({ ok: true })
  setAuthCookie(res, token)
  return res
}

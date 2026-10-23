import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken, setAuthCookie } from '@/lib/auth'
import { normEmail, findUserByEmail } from '@/lib/email'
import { consumeVerification } from '@/lib/phone-verification'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, phone, password, cargoId } = body
  // И-мэйлийг жижиг үсгээр хадгална — нууц үг сэргээхэд олдохгүй байхаас сэргийлнэ
  const email = normEmail(body.email)

  if (!name || !phone || !password || !cargoId) {
    return NextResponse.json({ error: 'Бүх талбарыг бөглөнө үү' }, { status: 400 })
  }

  const cargo = await prisma.cargo.findUnique({ where: { id: Number(cargoId) } })
  if (!cargo) {
    return NextResponse.json({ error: 'Карго олдсонгүй' }, { status: 400 })
  }
  // Утсаа баталгаажуулдаг каргод нууц үгээ утсаар сэргээнэ — и-мэйл заавал биш
  if (!email && !cargo.phoneVerify) {
    return NextResponse.json({ error: 'Бүх талбарыг бөглөнө үү' }, { status: 400 })
  }

  const [byPhone, byEmail] = await Promise.all([
    prisma.user.findUnique({ where: { phone } }),
    email ? findUserByEmail(email) : null,
  ])

  if (byEmail && byEmail.id !== byPhone?.id) {
    return NextResponse.json({ error: 'Утас эсвэл и-мэйл бүртгэлтэй байна' }, { status: 409 })
  }

  if (byPhone) {
    if (byPhone.cargoId === cargo.id) {
      return NextResponse.json({ error: 'Утас эсвэл и-мэйл бүртгэлтэй байна' }, { status: 409 })
    }
    // Тухайн утас өөр каргод бүртгэлтэй байна — зөвхөн энгийн хэрэглэгчийн бүртгэлийг
    // и-мэйлээр баталгаажуулаад шилжүүлж болно (админ/супер эрхийг энд шилжүүлэхгүй)
    if (byPhone.role !== 'USER') {
      return NextResponse.json({ error: 'Утас эсвэл и-мэйл бүртгэлтэй байна' }, { status: 409 })
    }
    const masked = byPhone.email ? byPhone.email.replace(/^(.).*(@.*)$/, '$1***$2') : null
    return NextResponse.json({ error: 'NEEDS_MOVE', code: 'NEEDS_MOVE', maskedEmail: masked }, { status: 409 })
  }

  // Админ асаасан каргод шинэ хэрэглэгч утсаа Verify.MN-ээр баталгаажуулсан байх ёстой — эс тэгвэл
  // бусдын дугаараар бүртгүүлж тэр дугаарын ачааг авах боломжтой. Бусад шалгалт давсны дараа хэрэглэнэ
  // (өөр талбарын алдаанаас болж хэрэглэгчийн төлсөн SMS шатахгүй).
  let phoneVerifiedAt: Date | null = null
  if (cargo.phoneVerify) {
    const verificationId = String(body.verificationId ?? '')
    if (!(await consumeVerification(verificationId, String(phone)))) {
      return NextResponse.json({ error: 'Утасны дугаараа баталгаажуулна уу' }, { status: 400 })
    }
    phoneVerifiedAt = new Date()
  }

  const hashed = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { name, phone, email: email || null, password: hashed, cargoId: cargo.id, phoneVerifiedAt },
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

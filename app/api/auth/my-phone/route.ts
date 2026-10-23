import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized } from '@/lib/auth'
import { consumeVerification, normalizePhone } from '@/lib/phone-verification'
import { logAdminAction } from '@/lib/audit'

// GET — нэвтэрсэн хүний дугаар, баталгаажсан эсэх
export async function GET(req: NextRequest) {
  const auth = await getVerifiedUserFromRequest(req)
  if (!auth) return unauthorized()
  const u = await prisma.user.findUnique({ where: { id: auth.userId }, select: { phone: true, phoneVerifiedAt: true } })
  return NextResponse.json({ phone: u?.phone ?? '', phoneVerifiedAt: u?.phoneVerifiedAt ?? null })
}

// POST { verificationId, phone } — SMS-ээр (зорилго "phone") баталгаажсан дугаарыг хадгална:
//   өөрийн дугаар бол ✓ тэмдэг, шинэ дугаар бол дугаар солигдоно (нэвтрэх нэр, ачааны эзний түлхүүр).
export async function POST(req: NextRequest) {
  const auth = await getVerifiedUserFromRequest(req)
  if (!auth) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const phone = normalizePhone(String(body.phone ?? ''))
  if (!/^\d{8}$/.test(phone) || !body.verificationId) {
    return NextResponse.json({ error: 'Утасны дугаараа баталгаажуулна уу' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { id: true, name: true, phone: true, cargoId: true } })
  if (!user) return unauthorized()
  if (phone !== user.phone) {
    const taken = await prisma.user.findUnique({ where: { phone }, select: { id: true } })
    if (taken) return NextResponse.json({ error: 'Энэ дугаар өөр бүртгэлд байна' }, { status: 409 })
  }
  if (!(await consumeVerification(String(body.verificationId), phone, 'phone'))) {
    return NextResponse.json({ error: 'Баталгаажуулалт хүчингүй эсвэл хугацаа дууссан. Дахин баталгаажуулна уу' }, { status: 400 })
  }

  const now = new Date()
  if (phone === user.phone) {
    await prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: now } })
    await logAdminAction(prisma, { cargoId: user.cargoId, userId: user.id, userName: user.name, action: 'user:phone-verified', detail: phone })
    return NextResponse.json({ ok: true, phone, changed: false })
  }

  try {
    await prisma.$transaction(async tx => {
      await tx.user.update({ where: { id: user.id }, data: { phone, phoneVerifiedAt: now } })
      // Олгогдоогүй ачааны утсыг шинэ дугаар руу (дараагийн Excel/олголт шинэ дугаараар таарна).
      // updatedAt-ыг хөдөлгөхгүй (raw SQL); олгосон ачаа түүхэндээ хуучин дугаартай үлдэнэ
      await tx.$executeRaw`
        UPDATE "Shipment" SET "phone" = ${phone}
        WHERE "userId" = ${user.id} AND "phone" = ${user.phone} AND "status" <> 'PICKED_UP'`
      // Шинэ дугаар дээр карго урьд бүртгэсэн эзэнгүй ачаа — бүртгүүлэхтэй адил холбоно
      await tx.$executeRaw`
        UPDATE "Shipment" SET "userId" = ${user.id}
        WHERE "phone" = ${phone} AND "userId" IS NULL AND "cargoId" = ${user.cargoId}`
    })
  } catch {
    return NextResponse.json({ error: 'Энэ дугаар өөр бүртгэлд байна' }, { status: 409 })
  }
  // Карго хуучин дугаараар Excel оруулсаар байвал ачаа холбогдохгүй — админ аудитаас харна
  await logAdminAction(prisma, {
    cargoId: user.cargoId, userId: user.id, userName: user.name,
    action: 'user:phone-changed', detail: `${user.phone} → ${phone}`,
  })
  return NextResponse.json({ ok: true, phone, changed: true })
}

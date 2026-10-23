import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { consumeVerification, normalizePhone } from '@/lib/phone-verification'

// POST { phone, verificationId, newPassword } — утсаа SMS-ээр (144773) баталгаажуулсан хүн шинэ нууц үг тавина.
// Баталгаажуулалт "reset" зорилготой, нэг удаагийн. Бусад төхөөрөмж дээрх нэвтрэлтийг гаргана (tokenVersion).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const phone = normalizePhone(String(body.phone ?? ''))
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (!/^\d{8}$/.test(phone) || !body.verificationId) {
    return NextResponse.json({ error: 'Утасны дугаараа баталгаажуулна уу' }, { status: 400 })
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'Нууц үг хамгийн багадаа 6 тэмдэгт байна' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } })
  if (!user) return NextResponse.json({ error: 'Энэ дугаараар бүртгэл олдсонгүй' }, { status: 404 })

  // Нууц үгийн шалгалт давсны дараа хэрэглэнэ — богино нууц үгнээс болж төлсөн SMS шатахгүй
  if (!(await consumeVerification(String(body.verificationId), phone, 'reset'))) {
    return NextResponse.json({ error: 'Баталгаажуулалт хүчингүй эсвэл хугацаа дууссан. Дахин баталгаажуулна уу' }, { status: 400 })
  }

  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, phoneVerifiedAt: new Date(), tokenVersion: { increment: 1 } },
  })
  return NextResponse.json({ ok: true })
}

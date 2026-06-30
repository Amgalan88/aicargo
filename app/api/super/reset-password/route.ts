import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const { userId, newPassword } = await req.json()
  if (!userId || !newPassword) {
    return NextResponse.json({ error: 'userId болон newPassword шаардлагатай' }, { status: 400 })
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'Нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой' }, { status: 400 })
  }

  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({
    where: { id: Number(userId) },
    data: { password: hashed, tokenVersion: { increment: 1 } },
  })

  return NextResponse.json({ ok: true })
}

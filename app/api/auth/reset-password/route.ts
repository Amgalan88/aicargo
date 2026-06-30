import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { resetToken, newPassword } = await req.json()

  if (!resetToken || !newPassword) {
    return NextResponse.json({ error: 'Мэдээлэл дутуу байна' }, { status: 400 })
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'Нууц үг хамгийн багадаа 6 тэмдэгт байна' }, { status: 400 })
  }

  let email: string
  try {
    const decoded = jwt.verify(resetToken, process.env.JWT_SECRET!) as { email: string }
    email = decoded.email
  } catch {
    return NextResponse.json({ error: 'Хугацаа дууссан эсвэл буруу токен' }, { status: 400 })
  }

  const hashed = await bcrypt.hash(newPassword, 10)
  try {
    await prisma.user.update({ where: { email }, data: { password: hashed } })
  } catch {
    return NextResponse.json({ error: 'Хэрэглэгч олдсонгүй' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

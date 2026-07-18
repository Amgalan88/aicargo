import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Redis } from '@upstash/redis'
import { prisma } from '@/lib/prisma'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function POST(req: NextRequest) {
  const { resetToken, newPassword } = await req.json()

  if (!resetToken || !newPassword) {
    return NextResponse.json({ error: 'Мэдээлэл дутуу байна' }, { status: 400 })
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'Нууц үг хамгийн багадаа 6 тэмдэгт байна' }, { status: 400 })
  }

  let email: string
  let jti: string
  try {
    const decoded = jwt.verify(resetToken, process.env.JWT_SECRET!) as { email: string; jti?: string }
    email = decoded.email
    jti = decoded.jti ?? ''
  } catch {
    return NextResponse.json({ error: 'Хугацаа дууссан эсвэл буруу токен' }, { status: 400 })
  }
  if (!jti) {
    return NextResponse.json({ error: 'Хугацаа дууссан эсвэл буруу токен' }, { status: 400 })
  }

  // Токен зөвхөн нэг л удаа хэрэглэгдэнэ — дахин ирвэл (leak/replay) татгалзана
  const claimed = await redis.set(`reset-token-used:${jti}`, '1', { nx: true, ex: 900 })
  if (!claimed) {
    return NextResponse.json({ error: 'Энэ токен аль хэдийн хэрэглэгдсэн байна' }, { status: 400 })
  }

  const hashed = await bcrypt.hash(newPassword, 10)
  try {
    await prisma.user.update({ where: { email }, data: { password: hashed } })
  } catch {
    return NextResponse.json({ error: 'Хэрэглэгч олдсонгүй' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

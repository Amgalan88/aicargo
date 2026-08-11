import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { prisma } from '@/lib/prisma'
import { sendMoveOtpEmail } from '@/lib/mail'

const ratelimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(3, '15 m'),
  prefix: 'register-move-otp',
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous'
  const { success } = await ratelimit.limit(ip)
  if (!success) {
    return NextResponse.json({ error: 'Хэт олон оролдлого. 15 минутын дараа дахин оролдоно уу.' }, { status: 429 })
  }

  const { phone, cargoId } = await req.json()
  if (!phone || !cargoId) {
    return NextResponse.json({ error: 'Мэдээлэл дутуу байна' }, { status: 400 })
  }

  const cargo = await prisma.cargo.findUnique({ where: { id: Number(cargoId) } })
  if (!cargo) {
    return NextResponse.json({ error: 'Карго олдсонгүй' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { phone } })
  if (!user || user.role !== 'USER' || user.cargoId === cargo.id || !user.email) {
    return NextResponse.json({ error: 'Шилжүүлэх боломжгүй байна' }, { status: 400 })
  }

  await prisma.otp.updateMany({ where: { email: user.email, used: false }, data: { used: true } })

  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
  await prisma.otp.create({ data: { email: user.email, code, expiresAt } })

  try {
    await sendMoveOtpEmail(user.email, code, cargo.name)
  } catch {
    return NextResponse.json({ error: 'И-мэйл илгээхэд алдаа гарлаа' }, { status: 500 })
  }

  const masked = user.email.replace(/^(.).*(@.*)$/, '$1***$2')
  return NextResponse.json({ ok: true, maskedEmail: masked })
}

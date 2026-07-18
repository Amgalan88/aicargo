import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { prisma } from '@/lib/prisma'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// 6 оронтой код бол force-brute хийхээс сэргийлж IP болон и-мэйлээр хязгаарлана
const ipRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 m'),
  prefix: 'verify-otp-ip',
})
const emailRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(8, '10 m'),
  prefix: 'verify-otp-email',
})

export async function POST(req: NextRequest) {
  const { email, code } = await req.json()

  if (!email || !code) {
    return NextResponse.json({ error: 'И-мэйл болон кодоо оруулна уу' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous'
  const [{ success: ipOk }, { success: emailOk }] = await Promise.all([
    ipRatelimit.limit(ip),
    emailRatelimit.limit(String(email)),
  ])
  if (!ipOk || !emailOk) {
    return NextResponse.json({ error: 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const otp = await prisma.otp.findFirst({
    where: { email, code, used: false },
    orderBy: { id: 'desc' },
  })

  if (!otp) {
    return NextResponse.json({ error: 'Код буруу байна' }, { status: 400 })
  }

  if (otp.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Кодны хугацаа дууссан байна' }, { status: 400 })
  }

  await prisma.otp.update({ where: { id: otp.id }, data: { used: true } })

  // jti = энэ OTP-ийн id — reset-password дээр токеныг нэг л удаа хэрэглэгдэхийг баталгаажуулахад ашиглана
  const { sign } = await import('jsonwebtoken')
  const token = sign({ email, jti: String(otp.id) }, process.env.JWT_SECRET!, { expiresIn: '15m' })

  return NextResponse.json({ resetToken: token })
}

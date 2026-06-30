import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { prisma } from '@/lib/prisma'
import { signToken, setAuthCookie } from '@/lib/auth'

const ratelimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(5, '60 s'),
  prefix: 'login',
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous'
  const { success } = await ratelimit.limit(ip)
  if (!success) {
    return NextResponse.json({ error: 'Хэт олон оролдлого. 1 минутын дараа дахин оролдоно уу.' }, { status: 429 })
  }

  const { phone, password } = await req.json()

  if (!phone || !password) {
    return NextResponse.json({ error: 'Утас болон нууц үгээ оруулна уу' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { phone } })
  if (!user) {
    return NextResponse.json({ error: 'Утас эсвэл нууц үг буруу' }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    return NextResponse.json({ error: 'Утас эсвэл нууц үг буруу' }, { status: 401 })
  }

  const cargoId = user.role === 'SUPER_ADMIN' ? null : user.cargoId
  const token = signToken({ userId: user.id, role: user.role, cargoId, tokenVersion: user.tokenVersion })
  const res = NextResponse.json({ ok: true, role: user.role })
  setAuthCookie(res, token)
  return res
}

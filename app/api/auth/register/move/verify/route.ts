import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { prisma } from '@/lib/prisma'
import { signToken, setAuthCookie } from '@/lib/auth'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})
const ipRatelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '10 m'), prefix: 'register-move-verify-ip' })
const phoneRatelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(8, '10 m'), prefix: 'register-move-verify-phone' })

export async function POST(req: NextRequest) {
  const { name, phone, password, cargoId, code } = await req.json()
  if (!name || !phone || !password || !cargoId || !code) {
    return NextResponse.json({ error: 'Мэдээлэл дутуу байна' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous'
  const [{ success: ipOk }, { success: phoneOk }] = await Promise.all([
    ipRatelimit.limit(ip),
    phoneRatelimit.limit(String(phone)),
  ])
  if (!ipOk || !phoneOk) {
    return NextResponse.json({ error: 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const cargo = await prisma.cargo.findUnique({ where: { id: Number(cargoId) } })
  if (!cargo) {
    return NextResponse.json({ error: 'Карго олдсонгүй' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { phone } })
  if (!user || user.role !== 'USER' || user.cargoId === cargo.id || !user.email) {
    return NextResponse.json({ error: 'Шилжүүлэх боломжгүй байна' }, { status: 400 })
  }

  const otp = await prisma.otp.findFirst({
    where: { email: user.email, code, used: false, expiresAt: { gt: new Date() } },
    orderBy: { id: 'desc' },
  })
  if (!otp) {
    return NextResponse.json({ error: 'Код буруу эсвэл хугацаа дууссан байна' }, { status: 400 })
  }

  const hashed = await bcrypt.hash(password, 10)

  const moved = await prisma.$transaction(async tx => {
    await tx.otp.update({ where: { id: otp.id }, data: { used: true } })
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { name, password: hashed, cargoId: cargo.id, tokenVersion: { increment: 1 } },
    })
    await tx.shipment.updateMany({
      where: { phone, userId: null, cargoId: cargo.id },
      data: { userId: updated.id },
    })
    return updated
  })

  const token = signToken({ userId: moved.id, role: moved.role, cargoId: moved.cargoId, tokenVersion: moved.tokenVersion })
  const res = NextResponse.json({ ok: true })
  setAuthCookie(res, token)
  return res
}

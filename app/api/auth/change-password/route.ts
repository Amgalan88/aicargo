import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, signToken, setAuthCookie } from '@/lib/auth'

// Одоогийн нууц үгийг таах оролдлогоос хамгаална
const ratelimit = new Ratelimit({
  redis: new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! }),
  limiter: Ratelimit.slidingWindow(5, '10 m'),
  prefix: 'change-password',
})

// POST { currentPassword, newPassword } — нэвтэрсэн хүн (админ, ажилтан, хэрэглэгч) нууц үгээ өөрөө солино.
// Бусад төхөөрөмж дээрх нэвтрэлт гарна (tokenVersion), энэ төхөөрөмж шинэ токентой үлдэнэ.
export async function POST(req: NextRequest) {
  const auth = await getVerifiedUserFromRequest(req)
  if (!auth) return unauthorized()

  const { success } = await ratelimit.limit(String(auth.userId))
  if (!success) return NextResponse.json({ error: 'Хэт олон оролдлого. 10 минутын дараа дахин оролдоно уу' }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const next = typeof body.newPassword === 'string' ? body.newPassword : ''
  if (!current || !next) return NextResponse.json({ error: 'Нууц үгээ оруулна уу' }, { status: 400 })
  if (next.length < 6) return NextResponse.json({ error: 'Шинэ нууц үг хамгийн багадаа 6 тэмдэгт байна' }, { status: 400 })
  if (next === current) return NextResponse.json({ error: 'Шинэ нууц үг одоогийнхоос өөр байх ёстой' }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { password: true } })
  if (!user || !(await bcrypt.compare(current, user.password))) {
    return NextResponse.json({ error: 'Одоогийн нууц үг буруу байна' }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id: auth.userId },
    data: { password: await bcrypt.hash(next, 10), tokenVersion: { increment: 1 } },
    select: { id: true, role: true, cargoId: true, tokenVersion: true },
  })
  const res = NextResponse.json({ ok: true })
  setAuthCookie(res, signToken({ userId: updated.id, role: updated.role, cargoId: updated.cargoId, tokenVersion: updated.tokenVersion }))
  return res
}

import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { prisma } from '@/lib/prisma'
import { sendCargoSignupOtpEmail } from '@/lib/mail'
import { validateSlug } from '@/lib/cargo-signup'

const ratelimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(3, '15 m'),
  prefix: 'cargo-signup-otp',
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous'
  const { success } = await ratelimit.limit(ip)
  if (!success) {
    return NextResponse.json({ error: 'Хэт олон оролдлого. 15 минутын дараа дахин оролдоно уу.' }, { status: 429 })
  }

  let body: {
    cargoName?: string; slug?: string
    adminName?: string; phone?: string; email?: string; password?: string
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const cargoName = body.cargoName?.trim() ?? ''
  const slug = body.slug?.trim().toLowerCase() ?? ''
  const adminName = body.adminName?.trim() ?? ''
  const phone = body.phone?.trim() ?? ''
  const email = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''

  // Бүх талбарын шалгалт — OTP илгээхээс ӨМНӨ
  if (cargoName.length < 2) return NextResponse.json({ error: 'Каргоны нэр оруулна уу' }, { status: 400 })
  const slugErr = validateSlug(slug)
  if (slugErr) return NextResponse.json({ error: slugErr }, { status: 400 })
  if (adminName.length < 2) return NextResponse.json({ error: 'Админы нэр оруулна уу' }, { status: 400 })
  if (!/^\d{8}$/.test(phone)) return NextResponse.json({ error: 'Утасны дугаар 8 оронтой байна' }, { status: 400 })
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'И-мэйл хаяг буруу байна' }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ error: 'Нууц үг 6-аас дээш тэмдэгт байна' }, { status: 400 })

  const [slugTaken, phoneTaken, emailTaken] = await Promise.all([
    prisma.cargo.findUnique({ where: { slug }, select: { id: true } }),
    prisma.user.findUnique({ where: { phone }, select: { id: true } }),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ])
  if (slugTaken) return NextResponse.json({ error: 'Энэ subdomain аль хэдийн эзэмшигдсэн байна' }, { status: 409 })
  if (phoneTaken) return NextResponse.json({ error: 'Энэ утасны дугаар бүртгэлтэй байна' }, { status: 409 })
  if (emailTaken) return NextResponse.json({ error: 'Энэ и-мэйл бүртгэлтэй байна' }, { status: 409 })

  // Хуучин OTP-уудыг хүчингүй болгоод шинийг илгээнэ
  await prisma.otp.updateMany({ where: { email, used: false }, data: { used: true } })

  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
  await prisma.otp.create({ data: { email, code, expiresAt } })

  try {
    await sendCargoSignupOtpEmail(email, code, cargoName)
  } catch {
    return NextResponse.json({ error: 'И-мэйл илгээхэд алдаа гарлаа' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { prisma } from '@/lib/prisma'
import { refreshVerification, startVerification, type StartResult } from '@/lib/phone-verification'

// Нэг IP-ээс олон дугаарт session нээж Verify.MN-ийг дүүргэхээс хамгаална
const ipRatelimit = new Ratelimit({
  redis: new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! }),
  limiter: Ratelimit.slidingWindow(10, '10 m'),
  prefix: 'phone-verify-ip',
})

const MESSAGES: Record<Extract<StartResult, { ok: false }>['error'], string> = {
  badPhone: 'Утасны дугаар 8 оронтой байна',
  phoneTaken: 'Энэ утасны дугаар бүртгэлтэй байна. Нэвтэрнэ үү',
  needsMove: '',
  unavailable: 'SMS баталгаажуулалт түр ажиллахгүй байна. Дараа дахин оролдоно уу',
  tooMany: 'Хэт олон оролдлого хийлээ. 10 минутын дараа дахин оролдоно уу',
}

// POST { phone, cargoId } — баталгаажуулалт эхлүүлнэ: код, богино дугаар, хугацааг буцаана (sessionId хэзээ ч биш)
export async function POST(req: NextRequest) {
  const { phone, cargoId } = await req.json().catch(() => ({}))
  const cargo = cargoId
    ? await prisma.cargo.findUnique({ where: { id: Number(cargoId) }, select: { id: true, phoneVerify: true } })
    : null
  if (!cargo) return NextResponse.json({ error: 'Карго олдсонгүй' }, { status: 400 })
  if (!cargo.phoneVerify) return NextResponse.json({ error: 'Энэ каргод утас баталгаажуулалт асаагүй байна' }, { status: 400 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous'
  const { success } = await ipRatelimit.limit(ip)
  if (!success) return NextResponse.json({ error: MESSAGES.tooMany }, { status: 429 })

  const res = await startVerification(String(phone ?? ''), cargo.id)
  if (res.ok) return NextResponse.json(res)
  // Өөр каргод бүртгэлтэй — хэрэглэгч шилжих урсгал руу орно
  if (res.error === 'needsMove') return NextResponse.json({ ok: false, code: 'NEEDS_MOVE' }, { status: 409 })
  return NextResponse.json({ ok: false, error: MESSAGES[res.error] }, { status: res.error === 'tooMany' ? 429 : 400 })
}

// GET ?id= — төлөв (PENDING | VERIFIED | EXPIRED); хөтөч 3 секунд тутам асууна
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id || id.length > 64) return NextResponse.json({ status: 'EXPIRED' })
  return NextResponse.json({ status: await refreshVerification(id) })
}

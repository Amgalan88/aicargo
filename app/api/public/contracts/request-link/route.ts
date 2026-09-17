import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { prisma } from '@/lib/prisma'
import { bad, readJson } from '@/lib/contract-auth'
import { sendGuestLinks, clientIp } from '@/lib/contract-server'

const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! })
const byIp = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '15 m'), prefix: 'guest-link-ip' })
const byEmail = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, '15 m'), prefix: 'guest-link-email' })

// Холбоосоо алдсан зочинд бүх амьд (болон цуцлагдсан) гэрээний холбоосыг дахин илгээнэ.
// Гэрээ байгаа эсэхээс үл хамааран ижил хариу өгнө — и-мэйл бүртгэлтэй эсэхийг задруулахгүй
export async function POST(req: NextRequest) {
  const body = await readJson<{ email?: string; website?: string }>(req)
  if (!body) return bad('Invalid JSON')
  if (body.website) return NextResponse.json({ ok: true })
  const email = body.email?.trim().toLowerCase() ?? ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad('И-мэйл хаяг буруу байна')

  const [a, b] = await Promise.all([byIp.limit(clientIp(req.headers) ?? 'anonymous'), byEmail.limit(email)])
  if (!a.success || !b.success) return bad('Хэт олон оролдлого. 15 минутын дараа дахин оролдоно уу', 429)

  const contracts = await prisma.warehouseContract.findMany({
    where: { cargoId: null, guestEmail: email, status: { not: 'REJECTED' }, accessToken: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { contractNo: true, status: true, accessToken: true, warehouse: { select: { name: true } } },
  })
  if (contracts.length) {
    try {
      await sendGuestLinks(email, contracts.map(c => ({
        warehouseName: c.warehouse.name, contractNo: c.contractNo, status: c.status, token: c.accessToken!,
      })))
    } catch (err) {
      console.error('guest link resend failed:', err)
    }
  }
  return NextResponse.json({ ok: true })
}

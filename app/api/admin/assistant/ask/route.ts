// Админы AI туслах — чөлөөт асуулт (Claude Haiku 5.5): POST /api/admin/assistant/ask { question, history?, page? }
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { getAnthropic } from '@/lib/anthropic'
import { getLoyaltyConfig } from '@/lib/loyalty'
import { askAssistant } from '@/lib/assistant-ai'
import { recordSpend, reserveQuestion } from '@/lib/assistant-budget'

export const maxDuration = 60

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' || !admin.cargoId) return forbidden()
  const cargoId = admin.cargoId

  const body = await req.json().catch(() => ({}))
  const question = str(body.question, 500)
  if (!question) return NextResponse.json({ error: 'Асуултаа бичнэ үү' }, { status: 400 })
  const page = str(body.page, 100).startsWith('/admin') ? str(body.page, 100) : '/admin'
  const history = (Array.isArray(body.history) ? body.history : []).slice(-3)
    .map((h: { q?: unknown; a?: unknown }) => ({ q: str(h?.q, 500), a: str(h?.a, 1500) }))
    .filter((h: { q: string; a: string }) => h.q && h.a)

  const cargo = await prisma.cargo.findUnique({
    where: { id: cargoId },
    select: { name: true, assistantEnabled: true, linkOrdersEnabled: true, promoEnabled: true, dispatchEnabled: true, batchEnabled: true },
  })
  if (!cargo?.assistantEnabled) return NextResponse.json({ error: 'Туслах унтраалттай байна' }, { status: 403 })
  const client = getAnthropic()
  if (!client) return NextResponse.json({ error: 'AI одоохондоо холбогдоогүй байна. Бэлэн асуултууд ажиллана.' }, { status: 503 })

  const slot = await reserveQuestion(admin.userId, cargoId)
  if (!slot.ok) return NextResponse.json({ error: slot.error }, { status: 429 })

  try {
    const loyalty = await getLoyaltyConfig(prisma, cargoId)
    const r = await askAssistant(client, prisma, cargoId, {
      question, history, page,
      cargo: { name: cargo.name, linkOrders: cargo.linkOrdersEnabled, promo: cargo.promoEnabled, dispatch: cargo.dispatchEnabled, batch: cargo.batchEnabled, loyalty: loyalty.vipEnabled || loyalty.pointsEnabled },
      admin: { name: admin.name, isOwner: !admin.isStaffAdmin },
    })
    await recordSpend(cargoId, r.usd)
    console.log(JSON.stringify({ assistant: 'ask', cargoId, userId: admin.userId, steps: r.steps, tools: r.tools, ...r.usage, usd: Number(r.usd.toFixed(5)) }))
    return NextResponse.json({ text: r.text, remaining: slot.remaining })
  } catch (e) {
    console.error('[assistant-ask]', e)
    return NextResponse.json({ error: 'AI түр ажиллахгүй байна. Хэсэг хугацааны дараа дахин оролдоно уу.' }, { status: 502 })
  }
}

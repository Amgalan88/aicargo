import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { auditLater } from '@/lib/audit'
import { parsePhone } from '@/lib/phone'
import { cleanTiers, newToken, normalizeCode, promoCargo } from '@/lib/promo'
import { promoGuard } from './guard'

// GET — шатууд + кодууд (гишүүдийн тоотой). PUT { tiers } — шатууд. POST — шинэ код. PATCH { id, ... } — код засах/идэвхгүй болгох
export async function GET(req: NextRequest) {
  const g = await promoGuard(req)
  if (g.error) return g.error
  const { tiers } = await promoCargo(prisma, g.cargoId)
  const codes = await prisma.promoCode.findMany({
    where: { cargoId: g.cargoId }, orderBy: [{ active: 'desc' }, { id: 'desc' }],
    select: { id: true, code: true, agentName: true, agentPhone: true, commissionPct: true, tierName: true, tierPct: true, token: true, active: true, createdAt: true, _count: { select: { members: true } } },
  })
  return NextResponse.json({
    canEdit: !g.admin.isStaffAdmin, tiers,
    codes: codes.map(({ _count, ...c }) => ({ ...c, commissionPct: Number(c.commissionPct), members: _count.members })),
  })
}

export async function PUT(req: NextRequest) {
  const g = await promoGuard(req, { write: 'хөнгөлөлтийн шат засах' })
  if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const tiers = cleanTiers(body.tiers)
  if (!tiers) return NextResponse.json({ error: 'Шат: нэр (20 тэмдэгт хүртэл), хувь 1–50, давхардалгүй, 10 хүртэл шат' }, { status: 400 })
  await prisma.cargo.update({ where: { id: g.cargoId }, data: { discountTiers: tiers as unknown as Prisma.InputJsonValue } })
  auditLater({ cargoId: g.cargoId, userId: g.admin.userId, userName: g.admin.name, action: 'promo:tiers', detail: tiers.map(t => `${t.name} ${t.pct}%`).join(', ') })
  return NextResponse.json({ tiers })
}

type CodeFields = { agentName?: string; agentPhone?: string | null; commissionPct?: number; tierName?: string | null; tierPct?: number | null; active?: boolean }

// Код үүсгэх/засахад шалгах талбарууд. tierName '' бол шатгүй код
async function readCodeFields(cargoId: number, body: Record<string, unknown>, partial: boolean): Promise<{ value: CodeFields } | { error: string }> {
  const out: CodeFields = {}
  if (!partial || body.agentName !== undefined) {
    const n = String(body.agentName ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)
    if (!n) return { error: 'Агентын нэр оруулна уу' }
    out.agentName = n
  }
  if (!partial || body.agentPhone !== undefined) {
    const raw = String(body.agentPhone ?? '').trim()
    const p = raw ? parsePhone(raw) : null
    if (raw && !p) return { error: 'Агентын утас буруу' }
    out.agentPhone = p
  }
  if (!partial || body.commissionPct !== undefined) {
    const s = String(body.commissionPct ?? '').trim().replace(',', '.')
    const v = Number(s)
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(s) || v > 100) return { error: 'Шимтгэлийн хувь 0–100 (жш 10 эсвэл 7.5)' }
    out.commissionPct = v
  }
  if (!partial || body.tierName !== undefined) {
    const name = String(body.tierName ?? '').trim()
    if (!name) { out.tierName = null; out.tierPct = null }
    else {
      const t = (await promoCargo(prisma, cargoId)).tiers.find(x => x.name === name)
      if (!t) return { error: 'Шат олдсонгүй' }
      out.tierName = t.name; out.tierPct = t.pct
    }
  }
  if (body.active !== undefined) out.active = body.active === true
  return { value: out }
}

export async function POST(req: NextRequest) {
  const g = await promoGuard(req, { write: 'промо код үүсгэх' })
  if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const code = normalizeCode(body.code)
  if (!code) return NextResponse.json({ error: 'Код: латин үсэг, тоо, 2–20 тэмдэгт (жш BOLD10)' }, { status: 400 })
  const f = await readCodeFields(g.cargoId, body, false)
  if ('error' in f) return NextResponse.json({ error: f.error }, { status: 400 })
  const v = f.value
  try {
    const created = await prisma.promoCode.create({
      data: {
        cargoId: g.cargoId, code, agentName: v.agentName!, agentPhone: v.agentPhone ?? null, commissionPct: v.commissionPct!,
        tierName: v.tierName ?? null, tierPct: v.tierPct ?? null, token: newToken(), createdById: g.admin.userId, createdByName: g.admin.name,
      },
      select: { id: true },
    })
    auditLater({ cargoId: g.cargoId, userId: g.admin.userId, userName: g.admin.name, action: 'promo:code-create', detail: `${code} · ${v.agentName} · ${v.commissionPct}%${v.tierName ? ` · ${v.tierName}` : ''}` })
    return NextResponse.json(created)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return NextResponse.json({ error: 'Энэ код бүртгэлтэй байна' }, { status: 409 })
    throw e
  }
}

export async function PATCH(req: NextRequest) {
  const g = await promoGuard(req, { write: 'промо код засах' })
  if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const before = await prisma.promoCode.findFirst({ where: { id: Number(body.id) || 0, cargoId: g.cargoId } })
  if (!before) return NextResponse.json({ error: 'Код олдсонгүй' }, { status: 404 })
  const f = await readCodeFields(g.cargoId, body, true)
  if ('error' in f) return NextResponse.json({ error: f.error }, { status: 400 })
  const v = f.value
  await prisma.promoCode.update({ where: { id: before.id }, data: v })
  const ch: string[] = []
  if (v.agentName !== undefined && v.agentName !== before.agentName) ch.push(`нэр ${before.agentName} → ${v.agentName}`)
  if (v.commissionPct !== undefined && v.commissionPct !== Number(before.commissionPct)) ch.push(`шимтгэл ${Number(before.commissionPct)}% → ${v.commissionPct}%`)
  if (v.tierName !== undefined && v.tierName !== before.tierName) ch.push(`шат ${before.tierName ?? '—'} → ${v.tierName ?? '—'}`)
  if (v.agentPhone !== undefined && v.agentPhone !== before.agentPhone) ch.push(`утас ${before.agentPhone ?? '—'} → ${v.agentPhone ?? '—'}`)
  if (v.active !== undefined && v.active !== before.active) ch.push(v.active ? 'идэвхжүүлсэн' : 'идэвхгүй болгосон')
  if (ch.length) auditLater({ cargoId: g.cargoId, userId: g.admin.userId, userName: g.admin.name, action: 'promo:code-edit', detail: `${before.code}: ${ch.join(', ')}` })
  return NextResponse.json({ ok: true })
}

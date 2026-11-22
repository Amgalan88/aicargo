import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logAdminAction } from '@/lib/audit'
import { parsePhone } from '@/lib/phone'
import { promoCargo, setTier } from '@/lib/promo'
import { promoGuard } from '../guard'

// GET ?q=утас&codeId= — кодтой эсвэл шаттай хэрэглэгчид (утсаар). 8 оронтой утсаар хайвал жагсаалтад байхгүй ч гарна (оноох)
export async function GET(req: NextRequest) {
  const g = await promoGuard(req)
  if (g.error) return g.error
  const cargoId = g.cargoId
  const q = (req.nextUrl.searchParams.get('q') ?? '').replace(/\D/g, '')
  const codeId = Number(req.nextUrl.searchParams.get('codeId')) || null
  const phoneFilter = q ? { contains: q } : undefined
  const [members, tiered] = await Promise.all([
    prisma.promoMember.findMany({
      where: { cargoId, ...(phoneFilter ? { phone: phoneFilter } : {}), ...(codeId ? { promoCodeId: codeId } : {}) },
      orderBy: { id: 'desc' }, take: 500,
      select: { phone: true, source: true, byName: true, createdAt: true, promoCode: { select: { id: true, code: true } } },
    }),
    codeId ? Promise.resolve([]) : prisma.loyaltyAccount.findMany({
      where: { cargoId, vipManualPct: { not: null }, ...(phoneFilter ? { phone: phoneFilter } : {}) },
      orderBy: { vipManualAt: 'desc' }, take: 500,
      select: { phone: true },
    }),
  ])
  const phones = [...new Set([...members.map(m => m.phone), ...tiered.map(t => t.phone), ...(/^\d{8}$/.test(q) ? [q] : [])])]
  const [accounts, users] = await Promise.all([
    prisma.loyaltyAccount.findMany({
      where: { cargoId, phone: { in: phones } },
      select: { phone: true, vipManualPct: true, vipManualTier: true, vipManualUntil: true, vipManualNote: true, vipManualByName: true },
    }),
    prisma.user.findMany({ where: { cargoId, phone: { in: phones } }, select: { phone: true, name: true } }),
  ])
  const accOf = new Map(accounts.map(a => [a.phone, a]))
  const nameOf = new Map(users.map(u => [u.phone, u.name]))
  const memOf = new Map(members.map(m => [m.phone, m]))
  const now = Date.now()
  const rows = phones.map(phone => {
    const a = accOf.get(phone), m = memOf.get(phone)
    const active = !!a?.vipManualPct && (!a.vipManualUntil || a.vipManualUntil.getTime() > now)
    return {
      phone, name: nameOf.get(phone) ?? null, registered: nameOf.has(phone),
      code: m ? { id: m.promoCode.id, code: m.promoCode.code, source: m.source, at: m.createdAt, by: m.byName } : null,
      tier: a?.vipManualPct ? { name: a.vipManualTier ?? `${a.vipManualPct}%`, pct: a.vipManualPct, until: a.vipManualUntil, note: a.vipManualNote, by: a.vipManualByName, active } : null,
    }
  })
  return NextResponse.json({ rows })
}

// POST { phone, codeId?: number | null, tier?: string | null, until?: 'YYYY-MM-DD', note? } — код ба/эсвэл шат оноох, солих, хасах.
// Талбар илгээгээгүй бол тэр хэсэг өөрчлөгдөхгүй
export async function POST(req: NextRequest) {
  const g = await promoGuard(req, { write: 'промо код / шат оноох' })
  if (g.error) return g.error
  const { admin, cargoId } = g
  const body = await req.json().catch(() => ({}))
  const phone = parsePhone(body.phone)
  if (!phone) return NextResponse.json({ error: 'Утасны дугаар буруу' }, { status: 400 })
  const me = await prisma.user.findUnique({ where: { id: admin.userId }, select: { phone: true } })
  const changes: string[] = []

  if (body.tier !== undefined) {
    const tierName = body.tier ? String(body.tier) : null
    const tier = tierName ? (await promoCargo(prisma, cargoId)).tiers.find(t => t.name === tierName) ?? null : null
    if (tierName && !tier) return NextResponse.json({ error: 'Шат олдсонгүй' }, { status: 400 })
    if (tier && me?.phone === phone) return NextResponse.json({ error: 'Өөрийн утсанд хөнгөлөлт оноох боломжгүй' }, { status: 400 })
    let until: Date | null = null
    if (tier && body.until) {
      if (typeof body.until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.until)) return NextResponse.json({ error: 'Дуусах огноо буруу' }, { status: 400 })
      until = new Date(`${body.until}T23:59:59.999+08:00`)
      if (isNaN(until.getTime()) || until.getTime() <= Date.now()) return NextResponse.json({ error: 'Дуусах огноо ирээдүйд байх ёстой' }, { status: 400 })
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) || null : null
    const prev = await prisma.loyaltyAccount.findUnique({ where: { cargoId_phone: { cargoId, phone } }, select: { vipManualPct: true, vipManualTier: true } })
    await setTier(prisma, cargoId, phone, tier, { until, note, actorId: admin.userId, actorName: admin.name })
    changes.push(`шат ${prev?.vipManualPct ? `${prev.vipManualTier ?? ''} ${prev.vipManualPct}%`.trim() : '—'} → ${tier ? `${tier.name} ${tier.pct}%` : 'хассан'}${until ? ` (${body.until} хүртэл)` : ''}`)
  }

  if (body.codeId !== undefined) {
    const prev = await prisma.promoMember.findUnique({ where: { cargoId_phone: { cargoId, phone } }, select: { id: true, promoCode: { select: { code: true } } } })
    if (body.codeId === null || body.codeId === '' || body.codeId === 0) {
      if (prev) { await prisma.promoMember.delete({ where: { id: prev.id } }); changes.push(`код ${prev.promoCode.code} → хассан`) }
    } else {
      const code = await prisma.promoCode.findFirst({ where: { id: Number(body.codeId) || 0, cargoId }, select: { id: true, code: true } })
      if (!code) return NextResponse.json({ error: 'Код олдсонгүй' }, { status: 400 })
      // Код солиход шимтгэл шинэ кодод одооноос тоологдоно (joinedAt шинэчлэгдэнэ)
      await prisma.promoMember.upsert({
        where: { cargoId_phone: { cargoId, phone } },
        update: { promoCodeId: code.id, source: 'admin', byName: admin.name, createdAt: new Date() },
        create: { cargoId, phone, promoCodeId: code.id, source: 'admin', byName: admin.name },
      })
      if (prev?.promoCode.code !== code.code) changes.push(`код ${prev?.promoCode.code ?? '—'} → ${code.code}`)
    }
  }

  if (changes.length) {
    await logAdminAction(prisma, { cargoId, userId: admin.userId, userName: admin.name, action: 'promo:assign', detail: `${phone}: ${changes.join(', ')}` })
  }
  return NextResponse.json({ ok: true })
}

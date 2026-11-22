// Промо код (агент) + шатлалтай хөнгөлөлт — Cargo.promoEnabled асаалттай каргод (туршилт: Атлас).
// Хөнгөлөлт нь урамшууллын «гараар оноох VIP»-ээр (LoyaltyAccount.vipManualPct, 50% хүртэл) олголтод хасагдана.
// Шимтгэл = кодоор ирсэн хэрэглэгчийн (утас) бүртгүүлснээс хойшх олголтоор БОДИТ төлсөн дүн (баримтын net, цуцлаагүй) × commissionPct%.
import { randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { ubMonthRange } from './loyalty-core'
import type { Db } from './loyalty'

export interface DiscountTier { name: string; pct: number }

export const DEFAULT_TIERS: DiscountTier[] = [
  { name: 'Standard', pct: 5 },
  { name: 'Silver', pct: 10 },
  { name: 'Gold', pct: 15 },
  { name: 'Platinum', pct: 20 },
  { name: 'Premium', pct: 30 },
  { name: 'VIP', pct: 50 },
]
export const MAX_TIER_PCT = 50
const MAX_TIERS = 10

// Шатын жагсаалт шалгах: нэр 1–20 тэмдэгт, давхардалгүй; хувь 1–50 бүхэл, давхардалгүй. Хувиар эрэмбэлнэ. Буруу бол null
export function cleanTiers(raw: unknown): DiscountTier[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TIERS) return null
  const out: DiscountTier[] = []
  for (const t of raw) {
    const name = String((t as DiscountTier)?.name ?? '').trim().replace(/\s+/g, ' ')
    const pct = Number((t as DiscountTier)?.pct)
    if (!name || name.length > 20 || !Number.isInteger(pct) || pct < 1 || pct > MAX_TIER_PCT) return null
    out.push({ name, pct })
  }
  const names = new Set(out.map(t => t.name.toLowerCase())), pcts = new Set(out.map(t => t.pct))
  if (names.size !== out.length || pcts.size !== out.length) return null
  return out.sort((a, b) => a.pct - b.pct)
}

export function tiersOf(raw: unknown): DiscountTier[] {
  return cleanTiers(raw) ?? DEFAULT_TIERS.map(t => ({ ...t }))
}

// Код: латин үсэг, тоо, - _ ; 2–20 тэмдэгт, том үсгээр
export function normalizeCode(raw: unknown): string | null {
  const c = String(raw ?? '').trim().toUpperCase()
  return /^[A-Z0-9_-]{2,20}$/.test(c) ? c : null
}

export const newToken = () => randomBytes(18).toString('base64url')

// Агентад харагдах: «Бо***», «99****15»
export function maskName(name: string | null | undefined): string {
  const n = (name ?? '').trim()
  return n ? `${[...n].slice(0, 2).join('')}***` : '—'
}
export function maskPhone(phone: string): string {
  return phone.length >= 6 ? `${phone.slice(0, 2)}****${phone.slice(-2)}` : '****'
}

export async function promoCargo(db: Db, cargoId: number) {
  const c = await db.cargo.findUnique({ where: { id: cargoId }, select: { promoEnabled: true, discountTiers: true } })
  return { enabled: !!c?.promoEnabled, tiers: tiersOf(c?.discountTiers) }
}

// Утсанд шат оноох (урамшууллын гараар оноох VIP). pct null бол цуцална
export async function setTier(db: Db, cargoId: number, phone: string, tier: DiscountTier | null,
  opts: { until: Date | null; note: string | null; actorId: number | null; actorName: string }) {
  const now = new Date()
  const data = tier
    ? { vipManualPct: tier.pct, vipManualTier: tier.name, vipManualNote: opts.note, vipManualUntil: opts.until, vipManualById: opts.actorId, vipManualByName: opts.actorName, vipManualAt: now }
    : { vipManualPct: null, vipManualTier: null, vipManualNote: opts.note, vipManualUntil: null, vipManualById: opts.actorId, vipManualByName: opts.actorName, vipManualAt: now }
  await db.loyaltyAccount.upsert({ where: { cargoId_phone: { cargoId, phone } }, update: data, create: { cargoId, phone, ...data } })
}

// Бүртгүүлэх / карго руу шилжих үед: идэвхтэй код бол гишүүн болгоно (өмнө нь кодтой бол хөндөхгүй),
// кодод шат холбосон бөгөөд хүнд одоо өндөр шат байхгүй бол шатыг ононо. Буруу/идэвхгүй код — чимээгүй алгасна
export async function joinPromo(db: Db, cargoId: number, phone: string, rawCode: unknown): Promise<string | null> {
  const code = normalizeCode(rawCode)
  if (!code) return null
  const promo = await db.promoCode.findFirst({
    where: { cargoId, code, active: true, cargo: { promoEnabled: true } },
    select: { id: true, code: true, tierName: true, tierPct: true },
  })
  if (!promo) return null
  const existing = await db.promoMember.findUnique({ where: { cargoId_phone: { cargoId, phone } }, select: { id: true } })
  if (existing) return null
  await db.promoMember.create({ data: { cargoId, phone, promoCodeId: promo.id, source: 'signup' } })
  if (promo.tierName && promo.tierPct) {
    const acc = await db.loyaltyAccount.findUnique({ where: { cargoId_phone: { cargoId, phone } }, select: { vipManualPct: true, vipManualUntil: true } })
    const current = acc?.vipManualPct && (!acc.vipManualUntil || acc.vipManualUntil > new Date()) ? acc.vipManualPct : 0
    if (current < promo.tierPct) {
      await setTier(db, cargoId, phone, { name: promo.tierName, pct: promo.tierPct }, { until: null, note: `Промо код ${promo.code}`, actorId: null, actorName: `Промо ${promo.code}` })
    }
  }
  return promo.code
}

// ── Сарын тайлан ────────────────────────────────────────────────────────────

export interface MemberLine { phone: string; name: string | null; joinedAt: Date; receipts: number; paidMnt: number }
export interface CodeReport {
  id: number; code: string; agentName: string; commissionPct: number; active: boolean
  members: number; newMembers: number; receipts: number; paidMnt: number; commissionMnt: number
  lines: MemberLine[]
}

const round = (n: number) => Math.round(n)

// month = 'YYYY-MM' (УБ). codeId өгвөл зөвхөн тэр код (агентын линк)
export async function promoReport(db: Db, cargoId: number, month: string, codeId?: number): Promise<CodeReport[] | null> {
  const range = ubMonthRange(month)
  if (!range) return null
  const codes = await db.promoCode.findMany({
    where: { cargoId, ...(codeId ? { id: codeId } : {}) },
    orderBy: { id: 'asc' },
    select: { id: true, code: true, agentName: true, commissionPct: true, active: true, members: { select: { phone: true, createdAt: true } } },
  })
  const phones = [...new Set(codes.flatMap(c => c.members.map(m => m.phone)))]
  const [receipts, users] = phones.length
    ? await Promise.all([
        db.handoverReceipt.findMany({
          where: { cargoId, phone: { in: phones }, voidedAt: null, createdAt: { gte: range.start, lte: range.end } },
          select: { phone: true, netMnt: true, createdAt: true },
        }),
        db.user.findMany({ where: { cargoId, phone: { in: phones } }, select: { phone: true, name: true } }),
      ])
    : [[], []]
  const nameOf = new Map(users.map(u => [u.phone, u.name]))
  const byPhone = new Map<string, { netMnt: Prisma.Decimal; createdAt: Date }[]>()
  for (const r of receipts) if (r.phone) byPhone.set(r.phone, [...(byPhone.get(r.phone) ?? []), r])

  return codes.map(c => {
    const lines: MemberLine[] = c.members.map(m => {
      // Шимтгэл зөвхөн кодоор нэгдсэнээс хойшх олголтоос
      const rs = (byPhone.get(m.phone) ?? []).filter(r => r.createdAt >= m.createdAt)
      return { phone: m.phone, name: nameOf.get(m.phone) ?? null, joinedAt: m.createdAt, receipts: rs.length, paidMnt: rs.reduce((s, r) => s + Number(r.netMnt), 0) }
    }).sort((a, b) => b.paidMnt - a.paidMnt || b.joinedAt.getTime() - a.joinedAt.getTime())
    const paidMnt = lines.reduce((s, l) => s + l.paidMnt, 0)
    const pct = Number(c.commissionPct)
    return {
      id: c.id, code: c.code, agentName: c.agentName, commissionPct: pct, active: c.active,
      members: lines.length,
      newMembers: lines.filter(l => l.joinedAt >= range.start && l.joinedAt <= range.end).length,
      receipts: lines.reduce((s, l) => s + l.receipts, 0),
      paidMnt, commissionMnt: round((paidMnt * pct) / 100), lines,
    }
  })
}

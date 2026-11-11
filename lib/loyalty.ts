// Урамшууллын тооцоолол (VIP хөнгөлөлт, карго оноо). Prisma import хийхгүй — сервер, клиент, тест бүгд хэрэглэнэ.
// Мөнгө бүхэл ₮, оноо бүхэл тоо. Хөнгөлөлт, оноог үргэлж доош (floor) бөөрөнхийлнө — карго алдагдалд орохгүй.

export const VIP_WINDOW_DAYS = 90
export const VIP_GRACE_DAYS = 30
export const POINTS_EXPIRY_DAYS = 180
export const MAX_REDEEM_PCT = 50
export const VIP_PCT_MAX = 5
// Оноогоор буцаах бодит хувь (оноон үнэ ÷ ₮/оноо) үүнээс хэтрэхгүй — 1 оноо = ₮1000 гэх мэт алдаатай тохиргооноос хамгаална
export const MAX_POINTS_RATE_PCT = 10
const DAY_MS = 86_400_000

export interface VipTier { minSpend: number; pct: number }

export const DEFAULT_VIP_TIERS: VipTier[] = [
  { minSpend: 90_000, pct: 1 },
  { minSpend: 190_000, pct: 2 },
  { minSpend: 290_000, pct: 3 },
  { minSpend: 730_000, pct: 5 },
]
export const DEFAULT_MNT_PER_POINT = 1000
export const DEFAULT_POINT_VALUE_MNT = 20

export interface LoyaltyConfig {
  exists: boolean
  vipEnabled: boolean
  pointsEnabled: boolean
  vipTiers: VipTier[]
  mntPerPoint: number
  pointValueMnt: number
}

export const LOYALTY_DEFAULTS: LoyaltyConfig = {
  exists: false,
  vipEnabled: false,
  pointsEnabled: false,
  vipTiers: DEFAULT_VIP_TIERS,
  mntPerPoint: DEFAULT_MNT_PER_POINT,
  pointValueMnt: DEFAULT_POINT_VALUE_MNT,
}

export type SkipReason = 'NO_PHONE' | 'STAFF_PHONE' | 'OFF'
export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  NO_PHONE: 'Утасгүй ачаа — урамшуулал тооцохгүй',
  STAFF_PHONE: 'Ажилтны утас — урамшуулал олгохгүй',
  OFF: 'Урамшуулал унтраалттай',
}
export type RedeemBlock = 'NO_BALANCE' | 'NOT_REGISTERED' | 'NOT_VERIFIED'
export const REDEEM_BLOCK_LABEL: Record<RedeemBlock, string> = {
  NO_BALANCE: 'Онооны үлдэгдэлгүй',
  NOT_REGISTERED: 'Бүртгэлгүй хэрэглэгч — оноо ашиглахын тулд бүртгүүлнэ',
  NOT_VERIFIED: 'Утсаа баталгаажуулаагүй — оноо ашиглах боломжгүй',
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS)
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v)
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

// Босго өсөхөд хувь заавал өснө, 1–5 шат, хувь 1..5
export function parseVipTiers(input: unknown): Parsed<VipTier[]> {
  if (!Array.isArray(input) || input.length === 0 || input.length > 5) return { ok: false, error: 'VIP шат 1–5 мөр байна' }
  const tiers: VipTier[] = []
  for (const t of input) {
    const minSpend = Number((t as VipTier)?.minSpend)
    const pct = Number((t as VipTier)?.pct)
    if (!isInt(minSpend) || minSpend <= 0 || minSpend > 1_000_000_000) return { ok: false, error: 'Шатны босго ₮1-ээс их бүхэл тоо байна' }
    if (!isInt(pct) || pct < 1 || pct > VIP_PCT_MAX) return { ok: false, error: `Хөнгөлөлтийн хувь 1–${VIP_PCT_MAX} байна` }
    tiers.push({ minSpend, pct })
  }
  tiers.sort((a, b) => a.minSpend - b.minSpend)
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].minSpend === tiers[i - 1].minSpend) return { ok: false, error: 'Ижил босготой хоёр шат байна' }
    if (tiers[i].pct <= tiers[i - 1].pct) return { ok: false, error: 'Босго өсөхөд хувь өсөх ёстой' }
  }
  return { ok: true, value: tiers }
}

export interface LoyaltySettingsInput {
  vipEnabled?: boolean
  pointsEnabled?: boolean
  vipTiers?: VipTier[]
  mntPerPoint?: number
  pointValueMnt?: number
}

export function parseLoyaltySettingsInput(body: unknown, current: LoyaltyConfig): Parsed<LoyaltySettingsInput> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Өгөгдөл буруу' }
  const b = body as Record<string, unknown>
  const out: LoyaltySettingsInput = {}
  for (const k of ['vipEnabled', 'pointsEnabled'] as const) {
    if (b[k] === undefined) continue
    if (typeof b[k] !== 'boolean') return { ok: false, error: 'Асаах/унтраах утга буруу' }
    out[k] = b[k] as boolean
  }
  if (b.vipTiers !== undefined) {
    const t = parseVipTiers(b.vipTiers)
    if (!t.ok) return t
    out.vipTiers = t.value
  }
  if (b.mntPerPoint !== undefined) {
    const n = Number(b.mntPerPoint)
    if (!isInt(n) || n < 1 || n > 1_000_000) return { ok: false, error: 'Оноо олох дүн (₮) 1–1,000,000 бүхэл тоо байна' }
    out.mntPerPoint = n
  }
  if (b.pointValueMnt !== undefined) {
    const n = Number(b.pointValueMnt)
    if (!isInt(n) || n < 1 || n > 100_000) return { ok: false, error: 'Нэг онооны үнэ (₮) 1–100,000 бүхэл тоо байна' }
    out.pointValueMnt = n
  }
  const mpp = out.mntPerPoint ?? current.mntPerPoint
  const pv = out.pointValueMnt ?? current.pointValueMnt
  if (pv * 100 > mpp * MAX_POINTS_RATE_PCT) {
    return { ok: false, error: `Оноогоор буцаах хувь ${MAX_POINTS_RATE_PCT}%-иас хэтэрч байна (₮${mpp} = 1 оноо = ₮${pv})` }
  }
  return { ok: true, value: out }
}

export function configFromRow(row: {
  vipEnabled: boolean; pointsEnabled: boolean; vipTiers: unknown; mntPerPoint: number; pointValueMnt: number
} | null): LoyaltyConfig {
  if (!row) return LOYALTY_DEFAULTS
  const tiers = parseVipTiers(row.vipTiers)
  return {
    exists: true,
    vipEnabled: row.vipEnabled,
    pointsEnabled: row.pointsEnabled,
    vipTiers: tiers.ok ? tiers.value : DEFAULT_VIP_TIERS,
    mntPerPoint: row.mntPerPoint > 0 ? row.mntPerPoint : DEFAULT_MNT_PER_POINT,
    pointValueMnt: row.pointValueMnt > 0 ? row.pointValueMnt : DEFAULT_POINT_VALUE_MNT,
  }
}

// ── VIP ────────────────────────────────────────────────────────────────

export function tierPctForSpend(spend: number, tiers: VipTier[]): number {
  let pct = 0
  for (const t of tiers) if (spend >= t.minSpend && t.pct > pct) pct = t.pct
  return pct
}

export interface AutoVipState { pct: number; graceUntil: Date | null }

// Шат өсвөл шууд. Буурах ёстой болмогц 30 хоног хуучин хувиа хадгална; тэр хугацаанд дахин босгоо давбал grace цуцлагдана
export function nextAutoVip(prev: AutoVipState, computedPct: number, now: Date): AutoVipState {
  if (computedPct >= prev.pct) return { pct: computedPct, graceUntil: null }
  if (!prev.graceUntil) return { pct: prev.pct, graceUntil: addDays(now, VIP_GRACE_DAYS) }
  if (now.getTime() >= prev.graceUntil.getTime()) return { pct: computedPct, graceUntil: null }
  return prev
}

export interface ManualVip { pct: number | null; until: Date | null }
export type VipSource = 'MANUAL' | 'AUTO'

export function manualVipActive(m: ManualVip, now: Date): boolean {
  return !!m.pct && m.pct > 0 && (!m.until || m.until.getTime() > now.getTime())
}

// Гараар оноосон ба автомат шатын аль ихийг нь
export function effectiveVip(m: ManualVip, autoPct: number, now: Date): { pct: number; source: VipSource | null } {
  const manual = manualVipActive(m, now) ? m.pct! : 0
  if (manual === 0 && autoPct <= 0) return { pct: 0, source: null }
  return manual >= autoPct ? { pct: manual, source: 'MANUAL' } : { pct: autoPct, source: 'AUTO' }
}

export function nextTier(spend: number, tiers: VipTier[], currentPct: number): { pct: number; minSpend: number; remaining: number } | null {
  const t = tiers.find(x => x.pct > currentPct && x.minSpend > spend)
  return t ? { pct: t.pct, minSpend: t.minSpend, remaining: t.minSpend - spend } : null
}

// ── Оноо (append-only ledger) ──────────────────────────────────────────

export type LedgerKind = 'EARN' | 'REDEEM' | 'ADJUST' | 'REDEEM_REFUND' | 'EXPIRE'
export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  EARN: 'Хуримтлагдсан', REDEEM: 'Ашигласан', ADJUST: 'Залруулга', REDEEM_REFUND: 'Буцаан олгосон', EXPIRE: 'Хугацаа дууссан',
}

export interface LedgerRow {
  id: number
  kind: string
  points: number
  createdAt: Date
  expiresAt: Date | null
  refLedgerId: number | null
}

export interface PointsState {
  available: number
  // Хасах залруулга үлдэгдлээс давсан хэсэг — дараагийн хуримтлалаас эхэлж суутгана
  debt: number
  dueExpiry: { lotId: number; points: number }[]
  expiringSoon: { points: number; at: Date | null }
}

// Орлого бүр нэг «лот» (өөрийн дуусах хугацаатай). Зарлага нь хамгийн түрүүнд дуусах лотоос хасна (FIFO).
// Хугацаа нь дууссан лотын үлдэгдэл EXPIRE мөр бичигдээгүй байсан ч ашиглагдахгүй — cron зөвхөн бүртгэл хөтөлнө
export function pointsState(rows: LedgerRow[], now: Date, soonDays = 30): PointsState {
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
  const lots: { id: number; remaining: number; expiresAt: Date | null }[] = []
  let debt = 0
  const alive = (lot: { expiresAt: Date | null }, at: Date) => !lot.expiresAt || lot.expiresAt.getTime() > at.getTime()
  for (const r of sorted) {
    if (r.points > 0) {
      const pay = Math.min(debt, r.points)
      debt -= pay
      lots.push({ id: r.id, remaining: r.points - pay, expiresAt: r.expiresAt })
      continue
    }
    if (r.points === 0) continue
    if (r.kind === 'EXPIRE' && r.refLedgerId != null) {
      const lot = lots.find(l => l.id === r.refLedgerId)
      if (lot) lot.remaining = Math.max(0, lot.remaining + r.points)
      continue
    }
    let need = -r.points
    const usable = lots
      .filter(l => l.remaining > 0 && alive(l, r.createdAt))
      .sort((a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity) || a.id - b.id)
    for (const lot of usable) {
      if (need === 0) break
      const take = Math.min(lot.remaining, need)
      lot.remaining -= take
      need -= take
    }
    debt += need
  }
  let live = 0
  const dueExpiry: PointsState['dueExpiry'] = []
  let soonPoints = 0
  let soonAt: Date | null = null
  const soonLimit = addDays(now, soonDays).getTime()
  for (const lot of lots) {
    if (lot.remaining <= 0) continue
    if (!alive(lot, now)) { dueExpiry.push({ lotId: lot.id, points: lot.remaining }); continue }
    live += lot.remaining
    if (lot.expiresAt && lot.expiresAt.getTime() <= soonLimit) {
      soonPoints += lot.remaining
      if (!soonAt || lot.expiresAt < soonAt) soonAt = lot.expiresAt
    }
  }
  const available = Math.max(0, live - debt)
  return { available, debt: Math.max(0, debt - live), dueExpiry, expiringSoon: { points: Math.min(soonPoints, available), at: soonAt } }
}

// ── Баримт ─────────────────────────────────────────────────────────────

export interface ReceiptTerms {
  vipPct: number
  // null = энэ олголтод оноо хуримтлагдахгүй
  mntPerPoint: number | null
  // null = оноо ашиглах боломжгүй
  pointValueMnt: number | null
}

export interface ReceiptTotals {
  grossMnt: number
  discountMnt: number
  redeemedPoints: number
  redeemedMnt: number
  netMnt: number
  earnedPoints: number
}

export function sumPrices(prices: unknown[]): number {
  return Math.round(prices.reduce<number>((s, p) => s + (p == null ? 0 : Number(p) || 0), 0))
}

export function discountFor(grossMnt: number, vipPct: number): number {
  return vipPct > 0 && grossMnt > 0 ? Math.floor((grossMnt * vipPct) / 100) : 0
}

// Нэг олголтын (хөнгөлөлтийн дараах) дүнгийн 50% хүртэл оноогоор
export function maxRedeemablePoints(grossMnt: number, vipPct: number, pointValueMnt: number | null, available: number): number {
  if (!pointValueMnt || available <= 0) return 0
  const afterDiscount = grossMnt - discountFor(grossMnt, vipPct)
  const capMnt = Math.floor((afterDiscount * MAX_REDEEM_PCT) / 100)
  return Math.max(0, Math.min(available, Math.floor(capMnt / pointValueMnt)))
}

// redeemPoints-ийг дуудагч maxRedeemablePoints-оор шалгасан байх ёстой; энд дахин хязгаарлана.
// Оноо зөвхөн бэлнээр (оноогоор биш) төлсөн хэсэгт ногдоно
export function computeReceipt(grossMnt: number, terms: ReceiptTerms, redeemPoints: number): ReceiptTotals {
  const gross = Math.max(0, Math.round(grossMnt))
  const discountMnt = discountFor(gross, terms.vipPct)
  const afterDiscount = gross - discountMnt
  const cap = terms.pointValueMnt ? Math.floor(Math.floor((afterDiscount * MAX_REDEEM_PCT) / 100) / terms.pointValueMnt) : 0
  const redeemedPoints = Math.max(0, Math.min(Math.floor(redeemPoints), cap))
  const redeemedMnt = redeemedPoints * (terms.pointValueMnt ?? 0)
  const netMnt = afterDiscount - redeemedMnt
  const earnedPoints = terms.mntPerPoint ? Math.floor(netMnt / terms.mntPerPoint) : 0
  return { grossMnt: gross, discountMnt, redeemedPoints, redeemedMnt, netMnt, earnedPoints }
}

// Олгосны дараа нийт дүн өөрчлөгдвөл (үнэ засах, ачаа буцаах) — олгох үеийн нөхцөлөөр (хувь, ханш) дахин бодно.
// Ашигласан оноо хэзээ ч нэмэгдэхгүй; шинэ дүнгийн 50%-иас хэтэрсэн хэсгийг буцааж олгоно
export function recomputeReceipt(current: ReceiptTotals, newGrossMnt: number, terms: ReceiptTerms): ReceiptTotals {
  return computeReceipt(newGrossMnt, terms, current.redeemedPoints)
}

export function receiptDelta(from: ReceiptTotals, to: ReceiptTotals): ReceiptTotals {
  return {
    grossMnt: to.grossMnt - from.grossMnt,
    discountMnt: to.discountMnt - from.discountMnt,
    redeemedPoints: to.redeemedPoints - from.redeemedPoints,
    redeemedMnt: to.redeemedMnt - from.redeemedMnt,
    netMnt: to.netMnt - from.netMnt,
    earnedPoints: to.earnedPoints - from.earnedPoints,
  }
}

export function isZeroDelta(d: ReceiptTotals): boolean {
  return Object.values(d).every(v => v === 0)
}

export function addTotals(a: ReceiptTotals, b: ReceiptTotals): ReceiptTotals {
  return {
    grossMnt: a.grossMnt + b.grossMnt,
    discountMnt: a.discountMnt + b.discountMnt,
    redeemedPoints: a.redeemedPoints + b.redeemedPoints,
    redeemedMnt: a.redeemedMnt + b.redeemedMnt,
    netMnt: a.netMnt + b.netMnt,
    earnedPoints: a.earnedPoints + b.earnedPoints,
  }
}

export const ZERO_TOTALS: ReceiptTotals = { grossMnt: 0, discountMnt: 0, redeemedPoints: 0, redeemedMnt: 0, netMnt: 0, earnedPoints: 0 }

// ── Огноо (Улаанбаатар) ────────────────────────────────────────────────

export function ubMonthRange(month: unknown): { start: Date; end: Date } | null {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null
  const [y, m] = month.split('-').map(Number)
  const start = new Date(`${month}-01T00:00:00+08:00`)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return { start, end: new Date(new Date(`${next}-01T00:00:00+08:00`).getTime() - 1) }
}

export function ubMonthOf(d: Date): string {
  const ub = new Date(d.getTime() + 8 * 3_600_000)
  return `${ub.getUTCFullYear()}-${String(ub.getUTCMonth() + 1).padStart(2, '0')}`
}

export function fmtMnt(n: number): string {
  return '₮' + Math.round(n).toLocaleString('en-US')
}

// Урамшууллын (Карго оноо · VIP хөнгөлөлт) цэвэр тооцоолол — Prisma импортгүй тул client, server, тест бүгд ашиглана.
// Мөнгийг дотооддоо мөнгө (₮ × 100) бүхэл тоогоор бодно; хөнгөлөлт, онооны ₮ дүн бүхэл ₮ руу ДООШ бөөрөнхийлнө.

export const DAY_MS = 86_400_000

export interface VipTier { minSpend: number; pct: number }

export interface LoyaltyConfig {
  pointsEnabled: boolean
  vipEnabled: boolean
  earnMntPerPoint: number
  pointValueMnt: number
  pointsExpiryDays: number
  maxRedeemPct: number
  vipWindowDays: number
  vipGraceDays: number
  vipTiers: VipTier[]
}

export const DEFAULT_VIP_TIERS: VipTier[] = [
  { minSpend: 90_000, pct: 1 },
  { minSpend: 190_000, pct: 2 },
  { minSpend: 290_000, pct: 3 },
  { minSpend: 730_000, pct: 5 },
]

// Мөр байхгүй карго = хоёр горим унтраалттай
export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  pointsEnabled: false,
  vipEnabled: false,
  earnMntPerPoint: 1000,
  pointValueMnt: 20,
  pointsExpiryDays: 180,
  maxRedeemPct: 100, // 2026-11: ачаа авахдаа оноогоор бүтэн төлж болно (эзэн 0–100 болгож өөрчилнө)
  vipWindowDays: 90,
  vipGraceDays: 30,
  vipTiers: DEFAULT_VIP_TIERS,
}

export const LIMITS = {
  earnMntPerPoint: [1, 1_000_000],
  pointValueMnt: [1, 100_000],
  pointsExpiryDays: [1, 3650],
  maxRedeemPct: [0, 100],
  vipWindowDays: [1, 365],
  vipGraceDays: [0, 365],
} as const

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

function cleanTiers(raw: unknown): VipTier[] | null {
  if (!Array.isArray(raw)) return null
  const out: VipTier[] = []
  for (const t of raw) {
    const minSpend = Number((t as VipTier)?.minSpend), pct = Number((t as VipTier)?.pct)
    if (!Number.isInteger(minSpend) || minSpend <= 0 || !Number.isInteger(pct) || pct < 1 || pct > 5) return null
    out.push({ minSpend, pct })
  }
  out.sort((a, b) => a.minSpend - b.minSpend)
  // Босго өсөхөд хувь буурч болохгүй, давхардсан босго/хувь болохгүй
  for (let i = 1; i < out.length; i++) {
    if (out[i].minSpend === out[i - 1].minSpend || out[i].pct <= out[i - 1].pct) return null
  }
  return out.length <= 5 ? out : null
}

// DB мөр (эсвэл null) → тохиргоо. Эвдэрсэн шат байвал анхдагч шатыг хэрэглэнэ
export function configFromRow(row: Partial<Record<keyof LoyaltyConfig, unknown>> | null | undefined): LoyaltyConfig {
  if (!row) return { ...DEFAULT_LOYALTY_CONFIG, vipTiers: [...DEFAULT_VIP_TIERS] }
  const n = (k: keyof typeof LIMITS) => (isInt(row[k]) ? (row[k] as number) : DEFAULT_LOYALTY_CONFIG[k])
  return {
    pointsEnabled: row.pointsEnabled === true,
    vipEnabled: row.vipEnabled === true,
    earnMntPerPoint: n('earnMntPerPoint'),
    pointValueMnt: n('pointValueMnt'),
    pointsExpiryDays: n('pointsExpiryDays'),
    maxRedeemPct: n('maxRedeemPct'),
    vipWindowDays: n('vipWindowDays'),
    vipGraceDays: n('vipGraceDays'),
    vipTiers: cleanTiers(row.vipTiers) ?? [...DEFAULT_VIP_TIERS],
  }
}

// Админы оруулсан тохиргоог шалгана. Буруу утга байвал хадгалахгүй (чимээгүй засахгүй)
export function validateConfigInput(input: unknown, current: LoyaltyConfig): { value: LoyaltyConfig } | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'Тохиргоо буруу байна' }
  const src = input as Record<string, unknown>
  const next: LoyaltyConfig = { ...current, vipTiers: [...current.vipTiers] }
  for (const k of ['pointsEnabled', 'vipEnabled'] as const) {
    if (src[k] === undefined) continue
    if (typeof src[k] !== 'boolean') return { error: `${k} буруу` }
    next[k] = src[k] as boolean
  }
  const labels: Record<keyof typeof LIMITS, string> = {
    earnMntPerPoint: '1 оноо авах дүн', pointValueMnt: '1 онооны үнэ', pointsExpiryDays: 'Онооны хугацаа',
    maxRedeemPct: 'Оноогоор төлөх дээд хувь', vipWindowDays: 'VIP тооцох хоног', vipGraceDays: 'Шат хадгалах хоног',
  }
  for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    if (src[k] === undefined) continue
    const v = typeof src[k] === 'string' && src[k] !== '' ? Number(src[k]) : src[k]
    const [lo, hi] = LIMITS[k]
    if (!isInt(v) || v < lo || v > hi) return { error: `${labels[k]}: ${lo}–${hi} бүхэл тоо байна` }
    next[k] = v
  }
  if (src.vipTiers !== undefined) {
    const tiers = cleanTiers(src.vipTiers)
    if (!tiers || tiers.length === 0) return { error: 'VIP шат: 1–5 шат, босго өсөхөд хувь (1–5%) өсөх ёстой' }
    next.vipTiers = tiers
  }
  return { value: next }
}

// ── VIP ──────────────────────────────────────────────────────────────────────

export function tierPct(spend: number, tiers: VipTier[]): number {
  let pct = 0
  for (const t of tiers) if (spend >= t.minSpend && t.pct > pct) pct = t.pct
  return pct
}

// Олголт (огноо, дүн) — VIP шатыг эдгээрээс тооцно
export interface SpendEvent { at: Date; amount: number }

function spendAt(events: SpendEvent[], s: number, windowMs: number): number {
  let sum = 0
  for (const e of events) {
    const t = e.at.getTime()
    if (t > s - windowMs && t <= s) sum += e.amount
  }
  return sum
}

export interface AutoVip {
  pct: number       // үйлчлэх автомат хувь (grace тооцсон)
  rawPct: number    // яг одоогийн зарцуулалтаар
  spend: number     // сүүлийн N хоногийн дүн
  held: boolean     // шат буурсан ч grace-ээр хадгалагдаж байна
  next: { pct: number; minSpend: number; remaining: number } | null
}

// Шат буурахад grace хоног хадгална = сүүлийн grace хоногийн аль ч мөчид хүрсэн хамгийн өндөр шат.
// Зарцуулалт зөвхөн олголтын агшинд өсдөг, бусад үед буурдаг тул (grace эхлэл, тухайн хугацааны олголтууд, одоо)
// цэгүүдийг шалгахад хангалттай — cron, хадгалсан төлөв хэрэггүй, үргэлж ижил үр дүн.
export function autoVip(events: SpendEvent[], now: Date, cfg: Pick<LoyaltyConfig, 'vipWindowDays' | 'vipGraceDays' | 'vipTiers'>): AutoVip {
  const windowMs = cfg.vipWindowDays * DAY_MS
  const nowMs = now.getTime()
  const from = nowMs - cfg.vipGraceDays * DAY_MS
  const spend = spendAt(events, nowMs, windowMs)
  const rawPct = tierPct(spend, cfg.vipTiers)
  let pct = rawPct
  if (cfg.vipGraceDays > 0) {
    pct = Math.max(pct, tierPct(spendAt(events, from, windowMs), cfg.vipTiers))
    for (const e of events) {
      const t = e.at.getTime()
      if (t > from && t <= nowMs) pct = Math.max(pct, tierPct(spendAt(events, t, windowMs), cfg.vipTiers))
    }
  }
  const nextTier = cfg.vipTiers.find(t => t.pct > rawPct && t.minSpend > spend)
  return {
    pct, rawPct, spend, held: pct > rawPct,
    next: nextTier ? { pct: nextTier.pct, minSpend: nextTier.minSpend, remaining: nextTier.minSpend - spend } : null,
  }
}

export interface ManualVip { vipManualPct: number | null; vipManualUntil: Date | null }

export function manualVipPct(acc: ManualVip | null | undefined, now: Date): number {
  if (!acc?.vipManualPct) return 0
  if (acc.vipManualUntil && acc.vipManualUntil.getTime() <= now.getTime()) return 0
  return acc.vipManualPct
}

// Гараар ба автомат — аль өндөр нь үйлчилнэ
export function effectiveVip(auto: Pick<AutoVip, 'pct'>, manualPct: number): { pct: number; source: 'AUTO' | 'MANUAL' | null } {
  if (manualPct <= 0 && auto.pct <= 0) return { pct: 0, source: null }
  return manualPct > auto.pct ? { pct: manualPct, source: 'MANUAL' } : { pct: auto.pct, source: 'AUTO' }
}

// ── Оноо (append-only дэвтрээс тооцно) ──────────────────────────────────────

export type LedgerKind = 'EARN' | 'REDEEM' | 'ADJUST' | 'EXPIRE' | 'VOID'

export interface LedgerEntry {
  id: number
  kind: LedgerKind | string
  points: number
  createdAt: Date
  expiresAt: Date | null
  refLedgerId: number | null
}

export interface PointsState {
  balance: number                       // одоо ашиглах боломжтой (сөрөг = үнэ буурснаас үүссэн өр)
  lots: { id: number; remaining: number; expiresAt: Date | null }[]
  dueExpiries: { lotId: number; points: number }[] // хугацаа дууссан ч EXPIRE мөр бичигдээгүй
  expiringSoon: { points: number; at: Date } | null
}

export interface ConsumedLot { lotId: number | null; points: number; expiresAt: Date | null }

// Оноо нь эерэг мөр бүрээр (EARN/ADJUST/VOID+) «багц» болно, хамгийн түрүүнд дуусах багцаас зарцуулна.
// refLedgerId-тай сөрөг мөр (VOID: буцаасан олголтын оноо) эхлээд тэр багцаас хасна, дутуу нь ердийн дарааллаар.
// Хугацаа дууссан багцын үлдэгдэл тэр мөчид шатна (EXPIRE мөр хожуу бичигдсэн ч тооцоо ижил).
export function simulatePoints(entries: LedgerEntry[], now: Date): PointsState {
  return runPoints(entries, now, null)
}

// Сөрөг мөр (жш REDEEM) ямар багцуудаас, хэдэн оноо авсныг буцаана — олголт буцаахад оноог
// анхны дуусах хугацаатай нь сэргээхэд хэрэглэнэ. lotId=null хэсэг нь өрөөр (deficit) авсан.
export function consumedLots(entries: LedgerEntry[], entryId: number, now: Date): ConsumedLot[] {
  const track = new Map<number, ConsumedLot[]>()
  runPoints(entries, now, track)
  return track.get(entryId) ?? []
}

function runPoints(entries: LedgerEntry[], now: Date, track: Map<number, ConsumedLot[]> | null): PointsState {
  const sorted = [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
  const active: { id: number; remaining: number; expiresAt: Date | null }[] = []
  const expired = new Map<number, number>()
  const materialized = new Set<number>()
  let deficit = 0

  const expireUpTo = (t: number) => {
    for (let i = active.length - 1; i >= 0; i--) {
      const lot = active[i]
      if (lot.expiresAt && lot.expiresAt.getTime() <= t) {
        active.splice(i, 1)
        if (lot.remaining > 0) expired.set(lot.id, lot.remaining)
      }
    }
  }
  const byExpiry = () => active.sort((a, b) =>
    (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity) || a.id - b.id)

  for (const e of sorted) {
    expireUpTo(e.createdAt.getTime())
    if (e.kind === 'EXPIRE') {
      if (e.refLedgerId != null) materialized.add(e.refLedgerId)
      continue
    }
    if (e.points > 0) {
      let amount = e.points
      const pay = Math.min(deficit, amount)
      deficit -= pay
      amount -= pay
      if (amount > 0) active.push({ id: e.id, remaining: amount, expiresAt: e.expiresAt })
    } else if (e.points < 0) {
      let need = -e.points
      const used: ConsumedLot[] = []
      const ordered = byExpiry()
      const ref = e.refLedgerId != null ? ordered.findIndex(l => l.id === e.refLedgerId) : -1
      if (ref > 0) ordered.unshift(...ordered.splice(ref, 1))
      for (const lot of ordered) {
        if (need === 0) break
        const take = Math.min(lot.remaining, need)
        if (take > 0) used.push({ lotId: lot.id, points: take, expiresAt: lot.expiresAt })
        lot.remaining -= take
        need -= take
      }
      for (let i = active.length - 1; i >= 0; i--) if (active[i].remaining === 0) active.splice(i, 1)
      if (need > 0) used.push({ lotId: null, points: need, expiresAt: null })
      deficit += need
      track?.set(e.id, used)
    }
  }
  expireUpTo(now.getTime())
  byExpiry()
  const balance = active.reduce((s, l) => s + l.remaining, 0) - deficit
  const dueExpiries = [...expired.entries()]
    .filter(([id, pts]) => pts > 0 && !materialized.has(id))
    .map(([lotId, points]) => ({ lotId, points }))
  const first = active.find(l => l.expiresAt)
  return {
    balance,
    lots: active.map(l => ({ ...l })),
    dueExpiries,
    // Ижил өдөр дуусах багцуудыг нэгтгэнэ (жш буцаасан олголтын оноо анхны багцынхаа хугацаатай сэргэсэн)
    expiringSoon: first?.expiresAt
      ? { points: active.filter(l => l.expiresAt?.getTime() === first.expiresAt!.getTime()).reduce((t, l) => t + l.remaining, 0), at: first.expiresAt }
      : null,
  }
}

// ── Баримтын тооцоо ─────────────────────────────────────────────────────────

export const toCents = (mnt: number | string | { toString(): string } | null | undefined) =>
  mnt == null ? 0 : Math.round(Number(mnt) * 100)
export const fromCents = (c: number) => c / 100
const floorMnt = (cents: number) => Math.floor(cents / 100) * 100

// Ирсэн (олгоогүй) ачааны VIP хөнгөлөлтийн урьдчилсан тооцоо — баримттай ижил дүрэм (₮ бүхэлд доош)
export function vipDiscountMnt(grossMnt: number, vipPct: number): number {
  if (!(vipPct > 0) || !(grossMnt > 0)) return 0
  return fromCents(floorMnt(Math.floor((toCents(grossMnt) * vipPct) / 100)))
}

// Олгосон баримтын төлсөн дүнг (net) ачаа бүрд нийт үнийн жингээр хуваана — нийлбэр нь яг баримтын net.
// Сүүлийн мөнгө (бүхэлчлэлийн үлдэгдэл) хамгийн их үнэтэй ачаанд ногдоно.
export function allocateReceiptNet(items: { id: number; grossMnt: number }[], netMnt: number): Map<number, number> {
  const out = new Map<number, number>()
  if (!items.length) return out
  const netC = toCents(netMnt)
  const grossC = items.reduce((t, i) => t + Math.max(0, toCents(i.grossMnt)), 0)
  let used = 0
  for (const i of items) {
    const share = grossC > 0 ? Math.floor((netC * Math.max(0, toCents(i.grossMnt))) / grossC / 100) * 100 : 0
    out.set(i.id, share); used += share
  }
  const top = items.reduce((a, b) => (toCents(b.grossMnt) > toCents(a.grossMnt) ? b : a))
  out.set(top.id, out.get(top.id)! + netC - used)
  for (const [k, v] of out) out.set(k, fromCents(v))
  return out
}

export interface QuoteInput {
  grossMnt: number
  cfg: LoyaltyConfig
  vip: { pct: number; source: 'AUTO' | 'MANUAL' | null }
  pointsBalance: number
  canRedeem: boolean          // бүртгэлтэй + утас баталгаажсан хэрэглэгч
  redeemPoints: number
  applyLoyalty: boolean       // false = утасгүй, эсвэл админ өөрийн утсанд олгож байна
}

export interface Quote {
  grossMnt: number
  vipPct: number
  vipSource: 'AUTO' | 'MANUAL' | null
  vipDiscountMnt: number
  maxRedeemPoints: number
  pointsRedeemed: number
  pointsRedeemedMnt: number
  netMnt: number
  pointsEarned: number
}

// Нэг олголтод ашиглаж болох дээд оноо: VIP-ийн ДАРААХ дүнгийн maxRedeemPct% (бүхэл оноо руу доош), үлдэгдлээс хэтрэхгүй
export function redeemCapPoints(afterVipMnt: number, cfg: Pick<LoyaltyConfig, 'maxRedeemPct' | 'pointValueMnt'>, balance: number): number {
  const pointC = cfg.pointValueMnt * 100
  if (!(pointC > 0)) return 0
  const capPoints = Math.floor(Math.floor((Math.max(0, toCents(afterVipMnt)) * cfg.maxRedeemPct) / 100) / pointC)
  return Math.max(0, Math.min(Math.floor(balance), capPoints))
}

export class RedeemError extends Error {
  constructor(message: string, readonly maxRedeemPoints: number) { super(message) }
}

export function quoteReceipt(q: QuoteInput): Quote {
  const grossC = Math.max(0, toCents(q.grossMnt))
  const vipOn = q.applyLoyalty && q.cfg.vipEnabled && q.vip.pct > 0
  const vipPct = vipOn ? Math.min(5, q.vip.pct) : 0
  const discountC = floorMnt(Math.floor((grossC * vipPct) / 100))
  const afterVipC = grossC - discountC
  const pointsOn = q.applyLoyalty && q.cfg.pointsEnabled
  const pointC = q.cfg.pointValueMnt * 100
  const maxRedeemPoints = pointsOn && q.canRedeem ? redeemCapPoints(fromCents(afterVipC), q.cfg, q.pointsBalance) : 0
  const want = q.redeemPoints
  if (!Number.isInteger(want) || want < 0) throw new RedeemError('Онооны тоо буруу', maxRedeemPoints)
  if (want > maxRedeemPoints) {
    throw new RedeemError(
      maxRedeemPoints === 0
        ? (!q.canRedeem ? 'Оноо ашиглахад бүртгэлтэй, утсаа баталгаажуулсан хэрэглэгч байх ёстой' : 'Ашиглах оноо алга')
        : `Хамгийн ихдээ ${maxRedeemPoints} оноо ашиглана`,
      maxRedeemPoints,
    )
  }
  const redeemedC = want * pointC
  const netC = afterVipC - redeemedC
  const earned = pointsOn ? Math.floor(netC / (q.cfg.earnMntPerPoint * 100)) : 0
  return {
    grossMnt: fromCents(grossC),
    vipPct,
    vipSource: vipOn ? q.vip.source : null,
    vipDiscountMnt: fromCents(discountC),
    maxRedeemPoints,
    pointsRedeemed: want,
    pointsRedeemedMnt: fromCents(redeemedC),
    netMnt: fromCents(netC),
    pointsEarned: earned,
  }
}

// Олгосны дараа үнэ засахад: баримтын тухайн мөчийн хувь, онооны үнэлгээгээр дахин бодож зөрүүг буцаана.
// Баримт, дэвтрийн хуучин мөрийг өөрчлөхгүй — дуудагч нь зөрүүг шинэ ADJUST мөр болгон бичнэ.
export interface ReceiptTerms {
  vipEnabled: boolean
  vipPct: number
  pointsEnabled: boolean
  earnMntPerPoint: number | null
  pointsRedeemedMnt: number
}

export function receiptOutcome(terms: ReceiptTerms, grossMnt: number): { vipDiscountMnt: number; netMnt: number; pointsEarned: number } {
  const grossC = Math.max(0, toCents(grossMnt))
  const pct = terms.vipEnabled ? terms.vipPct : 0
  const discountC = floorMnt(Math.floor((grossC * pct) / 100))
  const netC = Math.max(0, grossC - discountC - toCents(terms.pointsRedeemedMnt))
  const earned = terms.pointsEnabled && terms.earnMntPerPoint ? Math.floor(netC / (terms.earnMntPerPoint * 100)) : 0
  return { vipDiscountMnt: fromCents(discountC), netMnt: fromCents(netC), pointsEarned: earned }
}

export function priceChangeCompensation(terms: ReceiptTerms, prevGross: number, newGross: number, pointsSoFar: number) {
  const before = receiptOutcome(terms, prevGross)
  const after = receiptOutcome(terms, newGross)
  return {
    vipDiscountDeltaMnt: fromCents(toCents(after.vipDiscountMnt) - toCents(before.vipDiscountMnt)),
    pointsDelta: after.pointsEarned - pointsSoFar,
  }
}

// ── Бусад ────────────────────────────────────────────────────────────────────

// Олголтын эзэн: ачааны утас (1 трак = 1 эзэн), байхгүй бол хэрэглэгчийн утас
export function ownerPhoneOf(s: { phone: string | null; user?: { phone: string | null } | null }): string | null {
  const p = (s.phone ?? s.user?.phone ?? '').trim()
  return p || null
}

// "2026-11" → Улаанбаатарын цагаар сарын эхлэл/төгсгөл
export function ubMonthRange(month: unknown): { start: Date; end: Date } | null {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null
  const [y, m] = month.split('-').map(Number)
  const start = new Date(`${month}-01T00:00:00+08:00`)
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1
  const end = new Date(new Date(`${ny}-${String(nm).padStart(2, '0')}-01T00:00:00+08:00`).getTime() - 1)
  return { start, end }
}

export function ubMonthOf(d: Date): string {
  const ub = new Date(d.getTime() + 8 * 3600_000)
  return `${ub.getUTCFullYear()}-${String(ub.getUTCMonth() + 1).padStart(2, '0')}`
}

// Хэрэглэгчийн «Миний ачаа» дээр харагдах урамшуулал (JSON — огноо string)
export interface CustomerLoyaltyView {
  cargoId: number
  points: {
    balance: number; valueMnt: number; pointValueMnt: number; earnMntPerPoint: number; maxRedeemPct: number; expiryDays: number
    expiringSoon: { points: number; at: string } | null; canRedeem: boolean
  } | null
  vip: {
    pct: number; source: 'AUTO' | 'MANUAL' | null; spend: number; held: boolean
    next: { pct: number; minSpend: number; remaining: number } | null
    windowDays: number; graceDays: number; tiers: VipTier[]; manualUntil: string | null
  } | null
  receipts: {
    id: number; createdAt: string; itemCount: number; grossMnt: number; vipPct: number; vipDiscountMnt: number
    pointsRedeemed: number; pointsRedeemedMnt: number; netMnt: number; pointsEarned: number
  }[]
}

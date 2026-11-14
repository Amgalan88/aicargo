// /orders «Миний урамшуулал» карт (v2 compact) — цэвэр логик: горим, шатны байрлал, гол мөр, нэг зөвлөмж, «шинэ» үйл явдал.
// React, Prisma импортгүй → client, server, node тест бүгд ашиглана. Шатыг ХАТУУ БИЧИХГҮЙ — vip.tiers (админы тохиргоо)-оос уншина.
import { DAY_MS, redeemCapPoints, vipDiscountMnt, type CustomerLoyaltyView, type VipTier } from './loyalty-core'

export type LoyaltyVip = NonNullable<CustomerLoyaltyView['vip']>
export type LoyaltyPoints = NonNullable<CustomerLoyaltyView['points']>

export const tg = (n: number) => '₮' + Math.round(n).toLocaleString('en-US')
// ₮90 мян · ₮1.5 сая
export const tgK = (n: number) =>
  n >= 1e6 ? '₮' + (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + ' сая' : n >= 1000 ? '₮' + Math.round(n / 1000) + ' мян' : tg(n)
// Огноо Улаанбаатарын цагаар (server render ба хөтөч ижил гарна)
const ub = (iso: string | Date) => new Date(new Date(iso).getTime() + 8 * 3600_000)
export const fmtMD = (iso: string | Date) => { const d = ub(iso); return `${d.getUTCMonth() + 1}.${d.getUTCDate()}` }
export const fmtYMD = (iso: string | Date) => { const d = ub(iso); return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}` }

// Аль горимоор зурах: хоёулаа унтраалттай (эсвэл өгөгдөлгүй) → null = карт харагдахгүй
export type CardLayout = 'both' | 'vip' | 'points'
export function cardLayout(v: CustomerLoyaltyView | null | undefined): CardLayout | null {
  if (!v) return null
  if (v.vip && v.points) return 'both'
  if (v.vip) return 'vip'
  if (v.points) return 'points'
  return null
}

// Харуулах дараагийн шат: одоогийн (авто/гараар/хадгалсан) хувиас ӨНДӨР, хүрээгүй босготой эхний шат
export function nextTier(vip: Pick<LoyaltyVip, 'pct' | 'spend' | 'tiers'>): (VipTier & { remaining: number }) | null {
  const t = vip.tiers.find(x => x.pct > vip.pct && x.minSpend > vip.spend)
  return t ? { ...t, remaining: t.minSpend - vip.spend } : null
}

// N шатыг тэнцүү хэсэгт хуваасан шугам дээрх байрлал (0–100)
export function posOf(spend: number, tiers: VipTier[]): number {
  const n = tiers.length
  if (!n) return 0
  let lo = 0
  for (let i = 0; i < n; i++) {
    const hi = tiers[i].minSpend
    if (spend < hi) return ((i + Math.max(0, spend - lo) / (hi - lo)) / n) * 100
    lo = hi
  }
  return 100
}
export const tickPos = (i: number, n: number) => ((i + 1) / n) * 100

// VIP мөрийн гол текст
export type VipKey =
  | { kind: 'max' }
  | { kind: 'held'; keepMnt: number }
  | { kind: 'manual'; until: string | null }
  | { kind: 'progress'; remaining: number; nextPct: number }
export function vipKey(vip: LoyaltyVip): VipKey {
  const nx = nextTier(vip)
  if (!nx) return { kind: 'max' }
  if (vip.held) {
    const tier = vip.tiers.find(t => t.pct === vip.pct)
    return { kind: 'held', keepMnt: Math.max(0, (tier?.minSpend ?? 0) - vip.spend) }
  }
  if (vip.source === 'MANUAL') return { kind: 'manual', until: vip.manualUntil }
  return { kind: 'progress', remaining: nx.remaining, nextPct: nx.pct }
}

// Ирсэн ачаанд ашиглаж болох дээд оноо (олголтын quoteReceipt-тэй ижил: VIP-ийн дараах дүнгийн maxRedeemPct%)
export function maxRedeemFor(v: CustomerLoyaltyView, arrivedTotal: number): number {
  const p = v.points
  if (!p || !p.canRedeem || !(arrivedTotal > 0)) return 0
  const pct = v.vip?.pct ?? 0
  return redeemCapPoints(arrivedTotal - vipDiscountMnt(arrivedTotal, pct), p, p.balance)
}

// Нэг богино зөвлөмж — эхний таарсныг л (handoff §3)
export const EXPIRY_SOON_DAYS = 30
export type Hint =
  | { kind: 'verify' }
  | { kind: 'redeem'; mnt: number }
  | { kind: 'unlockNext'; pct: number }
  | { kind: 'expiring'; points: number; at: string }
  | { kind: 'vipDiscount'; mnt: number }
  | { kind: 'held'; days: number }
  | { kind: 'empty' }
export function pickHint(v: CustomerLoyaltyView, arrivedTotal: number, now: Date = new Date()): Hint | null {
  const P = v.points, V = v.vip, arrived = Math.max(0, arrivedTotal || 0), pct = V?.pct ?? 0
  if (P && !P.canRedeem && P.balance > 0) return { kind: 'verify' }
  const mr = P ? maxRedeemFor(v, arrived) : 0
  if (P && mr > 0) return { kind: 'redeem', mnt: mr * P.pointValueMnt }
  const nx = V ? nextTier(V) : null
  if (V && nx && arrived > 0 && V.spend + arrived >= nx.minSpend) return { kind: 'unlockNext', pct: nx.pct }
  const ex = P?.expiringSoon
  if (ex && ex.points > 0 && (new Date(ex.at).getTime() - now.getTime()) / DAY_MS <= EXPIRY_SOON_DAYS) return { kind: 'expiring', points: ex.points, at: ex.at }
  const d = V ? vipDiscountMnt(arrived, pct) : 0
  if (d > 0) return { kind: 'vipDiscount', mnt: d }
  if (V && V.held) return { kind: 'held', days: V.graceDays }
  if (P && P.balance === 0 && (!V || V.spend === 0)) return { kind: 'empty' }
  return null
}
export function hintText(h: Hint): string {
  switch (h.kind) {
    case 'verify': return 'Утсаа баталгаажуул'
    case 'redeem': return `Ачаа авахдаа ${tg(h.mnt)} хүртэл хасуулна`
    case 'unlockNext': return `Ирсэн ачаагаа авбал VIP ${h.pct}%`
    case 'expiring': return `${h.points} оноо ${fmtMD(h.at)}-нд дуусна`
    case 'vipDiscount': return `Ирсэн ачаанд −${tg(h.mnt)}`
    case 'held': return `Шат ${h.days} хоног хадгалагдана`
    case 'empty': return 'Ачаа авах бүрт оноо цуглуулна'
  }
}

export const redeemFact = (maxRedeemPct: number) => maxRedeemPct >= 100 ? 'Бүтэн төлж болно' : maxRedeemPct > 0 ? `${maxRedeemPct}% хүртэл` : null

// «Сүүлд харсан» төлөв (localStorage) — анх ачаалахад баярлахгүй, зөвхөн хадгална.
// Шинэ баримтын олсон оноо → toast; VIP хувь өссөн (VIP асаалттай үед л) → баярын цонх. Нэг нээлтэд нэг удаа.
export interface SeenLoyalty { pct: number; lastReceiptId: number }
export const seenKey = (cargoId: number, phone: string) => `aicargo:lh:${cargoId}:${phone}`
export function seenDiff(seen: SeenLoyalty | null, v: CustomerLoyaltyView): { toastPoints: number; unlockPct: number | null; next: SeenLoyalty } {
  const topId = v.receipts.reduce((m, r) => Math.max(m, r.id), 0)
  const curPct = v.vip ? v.vip.pct : (seen?.pct ?? 0)
  if (!seen) return { toastPoints: 0, unlockPct: null, next: { pct: curPct, lastReceiptId: topId } }
  const fresh = v.receipts.filter(r => r.id > seen.lastReceiptId)
  const toastPoints = v.points ? fresh.reduce((t, r) => t + (r.pointsEarned || 0), 0) : 0
  const unlockPct = v.vip && v.vip.pct > seen.pct ? v.vip.pct : null
  return { toastPoints, unlockPct, next: { pct: curPct, lastReceiptId: Math.max(seen.lastReceiptId, topId) } }
}
export function parseSeen(raw: string | null): SeenLoyalty | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw)
    return Number.isFinite(o?.pct) && Number.isFinite(o?.lastReceiptId) ? { pct: Number(o.pct), lastReceiptId: Number(o.lastReceiptId) } : null
  } catch { return null }
}

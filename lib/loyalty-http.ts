import { NextResponse } from 'next/server'
import { LoyaltyError, type GroupPlan, type RedeemRequest } from '@/lib/loyalty-db'
import { parsePhone } from '@/lib/phone'

export function loyaltyErrorResponse(e: unknown): NextResponse {
  if (e instanceof LoyaltyError) return NextResponse.json({ error: e.message }, { status: e.status })
  throw e
}

// { phone, points: число | 'max' } — зөвхөн нэг утасны олголтод оноо ашиглана
export function parseRedeem(raw: unknown): RedeemRequest {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { phone?: unknown; points?: unknown }
  const phone = parsePhone(r.phone)
  if (!phone) return null
  if (r.points === 'max') return { phone, points: 'max' }
  const n = Number(r.points)
  return Number.isInteger(n) && n > 0 ? { phone, points: n } : null
}

export function parseShipmentIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 2000)
}

export function planJson(p: GroupPlan) {
  return {
    phone: p.phone,
    shipmentIds: p.lines.map(l => l.id),
    skipReason: p.skipReason,
    vip: p.vip ? { pct: p.vip.pct, source: p.vip.source, spend: p.vip.spend, graceUntil: p.vip.graceUntil } : null,
    points: p.points,
    ...p.totals,
  }
}

export function receiptJson(r: {
  id: number; phone: string | null; shipmentCount: number; grossMnt: number; vipPct: number; vipSource: string | null
  discountMnt: number; redeemedPoints: number; redeemedMnt: number; netMnt: number; earnedPoints: number; skipReason: string | null; createdAt: Date
}) {
  return {
    id: r.id, phone: r.phone, shipmentCount: r.shipmentCount, grossMnt: r.grossMnt, vipPct: r.vipPct, vipSource: r.vipSource,
    discountMnt: r.discountMnt, redeemedPoints: r.redeemedPoints, redeemedMnt: r.redeemedMnt, netMnt: r.netMnt,
    earnedPoints: r.earnedPoints, skipReason: r.skipReason, createdAt: r.createdAt,
  }
}

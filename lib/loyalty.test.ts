import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  tierPctForSpend, nextAutoVip, effectiveVip, nextTier, parseVipTiers, parseLoyaltySettingsInput, configFromRow,
  pointsState, computeReceipt, recomputeReceipt, receiptDelta, isZeroDelta, maxRedeemablePoints, sumPrices,
  ubMonthRange, ubMonthOf, addDays, DEFAULT_VIP_TIERS, LOYALTY_DEFAULTS, type LedgerRow, type ReceiptTerms,
} from './loyalty'

const NOW = new Date('2026-11-11T04:00:00Z')

describe('VIP tiers (defaults ₮90k→1%, ₮190k→2%, ₮290k→3%, ₮730k→5%)', () => {
  it('maps 90-day spend to the highest reached tier', () => {
    assert.equal(tierPctForSpend(0, DEFAULT_VIP_TIERS), 0)
    assert.equal(tierPctForSpend(89_999, DEFAULT_VIP_TIERS), 0)
    assert.equal(tierPctForSpend(90_000, DEFAULT_VIP_TIERS), 1)
    assert.equal(tierPctForSpend(190_000, DEFAULT_VIP_TIERS), 2)
    assert.equal(tierPctForSpend(729_999, DEFAULT_VIP_TIERS), 3)
    assert.equal(tierPctForSpend(5_000_000, DEFAULT_VIP_TIERS), 5)
  })

  it('reports the next tier and the remaining amount', () => {
    assert.deepEqual(nextTier(150_000, DEFAULT_VIP_TIERS, 1), { pct: 2, minSpend: 190_000, remaining: 40_000 })
    assert.equal(nextTier(800_000, DEFAULT_VIP_TIERS, 5), null)
    // Гараар 3% авсан хэрэглэгчид дараагийн шат нь 5%
    assert.deepEqual(nextTier(10_000, DEFAULT_VIP_TIERS, 3), { pct: 5, minSpend: 730_000, remaining: 720_000 })
  })

  it('keeps a dropping tier for 30 days, then drops', () => {
    const up = nextAutoVip({ pct: 0, graceUntil: null }, 3, NOW)
    assert.deepEqual(up, { pct: 3, graceUntil: null })
    const drop = nextAutoVip(up, 1, NOW)
    assert.equal(drop.pct, 3)
    assert.equal(drop.graceUntil!.getTime(), addDays(NOW, 30).getTime())
    assert.deepEqual(nextAutoVip(drop, 1, addDays(NOW, 29)), drop)
    assert.deepEqual(nextAutoVip(drop, 1, addDays(NOW, 30)), { pct: 1, graceUntil: null })
    // Grace-ийн үеэр босгоо дахин давбал grace цуцлагдана
    assert.deepEqual(nextAutoVip(drop, 3, addDays(NOW, 10)), { pct: 3, graceUntil: null })
  })

  it('applies the higher of manual and automatic VIP', () => {
    assert.deepEqual(effectiveVip({ pct: 3, until: null }, 2, NOW), { pct: 3, source: 'MANUAL' })
    assert.deepEqual(effectiveVip({ pct: 2, until: null }, 5, NOW), { pct: 5, source: 'AUTO' })
    assert.deepEqual(effectiveVip({ pct: 5, until: addDays(NOW, -1) }, 1, NOW), { pct: 1, source: 'AUTO' })
    assert.deepEqual(effectiveVip({ pct: null, until: null }, 0, NOW), { pct: 0, source: null })
  })
})

describe('settings validation', () => {
  it('accepts sorted tiers with rising pct only (1..5)', () => {
    assert.equal(parseVipTiers(DEFAULT_VIP_TIERS).ok, true)
    const sorted = parseVipTiers([{ minSpend: 290000, pct: 3 }, { minSpend: 90000, pct: 1 }])
    assert.ok(sorted.ok && sorted.value[0].minSpend === 90000)
    assert.equal(parseVipTiers([{ minSpend: 90000, pct: 6 }]).ok, false)
    assert.equal(parseVipTiers([{ minSpend: 90000, pct: 0 }]).ok, false)
    assert.equal(parseVipTiers([{ minSpend: 90000, pct: 2 }, { minSpend: 190000, pct: 2 }]).ok, false)
    assert.equal(parseVipTiers([{ minSpend: 90000, pct: 1.5 }]).ok, false)
    assert.equal(parseVipTiers([]).ok, false)
    assert.equal(parseVipTiers(new Array(6).fill(0).map((_, i) => ({ minSpend: (i + 1) * 1000, pct: 1 }))).ok, false)
  })

  it('rejects a point rate above 10% and bad numbers', () => {
    assert.equal(parseLoyaltySettingsInput({ mntPerPoint: 1000, pointValueMnt: 20 }, LOYALTY_DEFAULTS).ok, true)
    assert.equal(parseLoyaltySettingsInput({ mntPerPoint: 100, pointValueMnt: 20 }, LOYALTY_DEFAULTS).ok, false)
    assert.equal(parseLoyaltySettingsInput({ pointValueMnt: 0 }, LOYALTY_DEFAULTS).ok, false)
    assert.equal(parseLoyaltySettingsInput({ vipEnabled: 'yes' }, LOYALTY_DEFAULTS).ok, false)
    assert.equal(parseLoyaltySettingsInput(null, LOYALTY_DEFAULTS).ok, false)
  })

  it('is OFF when there is no settings row, and falls back to default tiers on bad JSON', () => {
    const off = configFromRow(null)
    assert.equal(off.vipEnabled || off.pointsEnabled || off.exists, false)
    const c = configFromRow({ vipEnabled: true, pointsEnabled: false, vipTiers: 'junk', mntPerPoint: 1000, pointValueMnt: 20 })
    assert.deepEqual(c.vipTiers, DEFAULT_VIP_TIERS)
  })
})

const POINTS: ReceiptTerms = { vipPct: 0, mntPerPoint: 1000, pointValueMnt: 20 }

describe('receipt calculation', () => {
  it('sums Decimal-like prices and rounds to whole ₮', () => {
    assert.equal(sumPrices(['3000.00', 2500.5, null, '0']), 5501)
  })

  it('applies VIP % with floor rounding; no points without a rate', () => {
    const r = computeReceipt(12_345, { vipPct: 2, mntPerPoint: null, pointValueMnt: null }, 0)
    assert.deepEqual(r, { grossMnt: 12_345, discountMnt: 246, redeemedPoints: 0, redeemedMnt: 0, netMnt: 12_099, earnedPoints: 0 })
  })

  it('earns ₮1000 = 1 point on the cash-paid part only', () => {
    assert.equal(computeReceipt(12_999, POINTS, 0).earnedPoints, 12)
    const r = computeReceipt(20_000, POINTS, 100)
    assert.equal(r.redeemedMnt, 2000)
    assert.equal(r.netMnt, 18_000)
    assert.equal(r.earnedPoints, 18)
  })

  it('caps redemption at 50% of the (discounted) handover', () => {
    assert.equal(maxRedeemablePoints(10_000, 0, 20, 10_000), 250)
    assert.equal(maxRedeemablePoints(10_000, 5, 20, 10_000), 237) // 9500 × 50% = 4750 → 237 оноо
    assert.equal(maxRedeemablePoints(10_000, 0, 20, 30), 30)
    assert.equal(maxRedeemablePoints(10_000, 0, null, 30), 0)
    const r = computeReceipt(10_000, POINTS, 999)
    assert.equal(r.redeemedPoints, 250)
    assert.equal(r.netMnt, 5000)
  })

  it('combines VIP and points: discount first, then redemption, then earn', () => {
    const r = computeReceipt(100_000, { vipPct: 3, mntPerPoint: 1000, pointValueMnt: 20 }, 500)
    assert.deepEqual(r, { grossMnt: 100_000, discountMnt: 3000, redeemedPoints: 500, redeemedMnt: 10_000, netMnt: 87_000, earnedPoints: 87 })
  })
})

describe('receipt correction after handover', () => {
  const terms: ReceiptTerms = { vipPct: 2, mntPerPoint: 1000, pointValueMnt: 20 }
  const original = computeReceipt(50_000, terms, 300)

  it('is a no-op when the total did not change', () => {
    assert.ok(isZeroDelta(receiptDelta(original, recomputeReceipt(original, 50_000, terms))))
  })

  it('raises discount and earned points when the price goes up; redemption never grows', () => {
    const d = receiptDelta(original, recomputeReceipt(original, 80_000, terms))
    assert.equal(d.grossMnt, 30_000)
    assert.equal(d.discountMnt, 600)
    assert.equal(d.redeemedPoints, 0)
    assert.equal(d.earnedPoints, 29)
  })

  it('refunds redeemed points above the new 50% cap and claws back earned points', () => {
    const d = receiptDelta(original, recomputeReceipt(original, 10_000, terms))
    // 10,000 − 2% = 9,800 → 50% = 4,900 → 245 оноо хүртэл
    assert.equal(d.redeemedPoints, -55)
    assert.equal(d.earnedPoints, -(original.earnedPoints - 4))
  })

  it('reverses everything when all shipments are reverted', () => {
    const next = recomputeReceipt(original, 0, terms)
    assert.deepEqual(next, { grossMnt: 0, discountMnt: 0, redeemedPoints: 0, redeemedMnt: 0, netMnt: 0, earnedPoints: 0 })
  })
})

function row(id: number, kind: string, points: number, createdAt: Date, opts: { expiresAt?: Date | null; ref?: number } = {}): LedgerRow {
  return { id, kind, points, createdAt, expiresAt: opts.expiresAt === undefined ? (points > 0 ? addDays(createdAt, 180) : null) : opts.expiresAt, refLedgerId: opts.ref ?? null }
}

describe('points ledger (FIFO, 180-day expiry)', () => {
  const d0 = new Date('2026-01-01T00:00:00Z')

  it('sums earns and redemptions', () => {
    const s = pointsState([row(1, 'EARN', 100, d0), row(2, 'REDEEM', -30, addDays(d0, 1))], addDays(d0, 2))
    assert.equal(s.available, 70)
  })

  it('expires a lot after 180 days even without an EXPIRE row, and lists it as due', () => {
    const s = pointsState([row(1, 'EARN', 100, d0), row(2, 'EARN', 50, addDays(d0, 100))], addDays(d0, 181))
    assert.equal(s.available, 50)
    assert.deepEqual(s.dueExpiry, [{ lotId: 1, points: 100 }])
  })

  it('spends the oldest lot first so less expires', () => {
    const rows = [row(1, 'EARN', 100, d0), row(2, 'EARN', 100, addDays(d0, 100)), row(3, 'REDEEM', -120, addDays(d0, 150))]
    const s = pointsState(rows, addDays(d0, 181))
    assert.equal(s.available, 80)
    assert.deepEqual(s.dueExpiry, [])
  })

  it('does not double-count once an EXPIRE row is written', () => {
    const rows = [row(1, 'EARN', 100, d0), row(2, 'EXPIRE', -100, addDays(d0, 180), { ref: 1 })]
    const s = pointsState(rows, addDays(d0, 181))
    assert.equal(s.available, 0)
    assert.deepEqual(s.dueExpiry, [])
  })

  it('carries a negative correction as debt against later earnings', () => {
    const rows = [row(1, 'EARN', 10, d0), row(2, 'REDEEM', -10, addDays(d0, 1)), row(3, 'ADJUST', -5, addDays(d0, 2)), row(4, 'EARN', 8, addDays(d0, 3))]
    const s = pointsState(rows, addDays(d0, 4))
    assert.equal(s.available, 3)
    assert.equal(s.debt, 0)
  })

  it('reports points that expire within 30 days', () => {
    const s = pointsState([row(1, 'EARN', 40, d0), row(2, 'EARN', 60, addDays(d0, 90))], addDays(d0, 160))
    assert.equal(s.expiringSoon.points, 40)
    assert.equal(s.expiringSoon.at!.getTime(), addDays(d0, 180).getTime())
  })
})

describe('Ulaanbaatar month range', () => {
  it('starts at 00:00 UB (16:00 UTC the day before)', () => {
    const r = ubMonthRange('2026-11')!
    assert.equal(r.start.toISOString(), '2026-10-31T16:00:00.000Z')
    assert.equal(r.end.toISOString(), '2026-11-30T15:59:59.999Z')
    assert.equal(ubMonthRange('2026-12')!.end.toISOString(), '2026-12-31T15:59:59.999Z')
    assert.equal(ubMonthRange('2026-13'), null)
    assert.equal(ubMonthOf(new Date('2026-10-31T16:30:00Z')), '2026-11')
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_LOYALTY_CONFIG, DAY_MS, configFromRow, validateConfigInput, tierPct, autoVip, manualVipPct, effectiveVip,
  simulatePoints, consumedLots, quoteReceipt, RedeemError, receiptOutcome, priceChangeCompensation, ownerPhoneOf, ubMonthRange, ubMonthOf,
  type LedgerEntry, type LoyaltyConfig,
} from './loyalty-core'

const NOW = new Date('2026-11-11T04:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS)
const ON: LoyaltyConfig = { ...DEFAULT_LOYALTY_CONFIG, pointsEnabled: true, vipEnabled: true }

describe('config', () => {
  it('no row → both modes OFF with the approved defaults', () => {
    const c = configFromRow(null)
    assert.equal(c.pointsEnabled, false)
    assert.equal(c.vipEnabled, false)
    assert.deepEqual(c.vipTiers, [
      { minSpend: 90000, pct: 1 }, { minSpend: 190000, pct: 2 }, { minSpend: 290000, pct: 3 }, { minSpend: 730000, pct: 5 },
    ])
    assert.equal(c.earnMntPerPoint, 1000)
    assert.equal(c.pointValueMnt, 20)
    assert.equal(c.pointsExpiryDays, 180)
    assert.equal(c.maxRedeemPct, 50)
    assert.equal(c.vipWindowDays, 90)
    assert.equal(c.vipGraceDays, 30)
  })

  it('validates ranges and tier monotonicity, never silently fixes', () => {
    const base = configFromRow(null)
    assert.ok('error' in validateConfigInput({ maxRedeemPct: 120 }, base))
    assert.ok('error' in validateConfigInput({ pointValueMnt: 0 }, base))
    assert.ok('error' in validateConfigInput({ earnMntPerPoint: 1.5 }, base))
    assert.ok('error' in validateConfigInput({ pointsEnabled: 'yes' }, base))
    assert.ok('error' in validateConfigInput({ vipTiers: [{ minSpend: 100, pct: 6 }] }, base))
    assert.ok('error' in validateConfigInput({ vipTiers: [{ minSpend: 100, pct: 2 }, { minSpend: 200, pct: 1 }] }, base))
    assert.ok('error' in validateConfigInput({ vipTiers: [] }, base))
    const ok = validateConfigInput({ vipEnabled: true, maxRedeemPct: '30', vipTiers: [{ minSpend: 50000, pct: 2 }, { minSpend: 10000, pct: 1 }] }, base)
    assert.ok('value' in ok)
    assert.equal(ok.value.vipEnabled, true)
    assert.equal(ok.value.pointsEnabled, false)
    assert.equal(ok.value.maxRedeemPct, 30)
    assert.deepEqual(ok.value.vipTiers, [{ minSpend: 10000, pct: 1 }, { minSpend: 50000, pct: 2 }])
  })

  it('broken stored tiers fall back to defaults', () => {
    assert.deepEqual(configFromRow({ vipTiers: 'x' }).vipTiers, DEFAULT_LOYALTY_CONFIG.vipTiers)
  })
})

describe('VIP tiers', () => {
  it('maps spend to tiers at the exact thresholds', () => {
    const t = DEFAULT_LOYALTY_CONFIG.vipTiers
    assert.equal(tierPct(89_999, t), 0)
    assert.equal(tierPct(90_000, t), 1)
    assert.equal(tierPct(190_000, t), 2)
    assert.equal(tierPct(290_000, t), 3)
    assert.equal(tierPct(729_999, t), 3)
    assert.equal(tierPct(730_000, t), 5)
  })

  it('uses only the last 90 days', () => {
    const r = autoVip([{ at: daysAgo(91), amount: 500_000 }, { at: daysAgo(10), amount: 95_000 }], NOW, { ...ON, vipGraceDays: 0 })
    assert.equal(r.spend, 95_000)
    assert.equal(r.pct, 1)
    assert.deepEqual(r.next, { pct: 2, minSpend: 190_000, remaining: 95_000 })
  })

  it('keeps a dropped tier for 30 days (grace), then drops', () => {
    // 200k spent 100 days ago → tier 2 until day 90; window drops it at 90 days ago → grace until 60 days ago... keep cases explicit
    const ev = [{ at: daysAgo(80), amount: 200_000 }]
    assert.equal(autoVip(ev, NOW, ON).pct, 2) // still inside window
    const ev2 = [{ at: daysAgo(100), amount: 200_000 }] // fell out of window 10 days ago
    const held = autoVip(ev2, NOW, ON)
    assert.equal(held.rawPct, 0)
    assert.equal(held.pct, 2)
    assert.equal(held.held, true)
    const ev3 = [{ at: daysAgo(121), amount: 200_000 }] // fell out 31 days ago
    assert.equal(autoVip(ev3, NOW, ON).pct, 0)
  })

  it('grace does not invent a tier never reached', () => {
    const ev = [{ at: daysAgo(100), amount: 60_000 }, { at: daysAgo(20), amount: 60_000 }]
    // max spend in any 90d window touching the last 30 days = 60k+60k only if both inside one window: 100-20=80 < 90 → yes at day 20
    assert.equal(autoVip(ev, NOW, ON).pct, 1)
    const ev2 = [{ at: daysAgo(115), amount: 60_000 }, { at: daysAgo(20), amount: 60_000 }] // 95 days apart → never 120k together
    assert.equal(autoVip(ev2, NOW, ON).pct, 0)
  })

  it('manual vs auto: the higher applies; expired manual ignored', () => {
    assert.deepEqual(effectiveVip({ pct: 2 }, manualVipPct({ vipManualPct: 3, vipManualUntil: null }, NOW)), { pct: 3, source: 'MANUAL' })
    assert.deepEqual(effectiveVip({ pct: 3 }, manualVipPct({ vipManualPct: 1, vipManualUntil: null }, NOW)), { pct: 3, source: 'AUTO' })
    assert.equal(manualVipPct({ vipManualPct: 5, vipManualUntil: daysAgo(1) }, NOW), 0)
    assert.equal(manualVipPct({ vipManualPct: 5, vipManualUntil: daysAgo(-1) }, NOW), 5)
    assert.deepEqual(effectiveVip({ pct: 0 }, 0), { pct: 0, source: null })
  })
})

let nextId = 1
const L = (kind: string, points: number, created: Date, expires: Date | null = null, ref: number | null = null): LedgerEntry =>
  ({ id: nextId++, kind, points, createdAt: created, expiresAt: expires, refLedgerId: ref })

describe('points ledger simulation', () => {
  it('earn, redeem, balance', () => {
    const e = [L('EARN', 100, daysAgo(10), daysAgo(-170)), L('REDEEM', -30, daysAgo(5))]
    assert.equal(simulatePoints(e, NOW).balance, 70)
  })

  it('expires unspent points after 180 days and reports them as due once', () => {
    const earn = L('EARN', 100, daysAgo(200), daysAgo(20))
    const redeem = L('REDEEM', -40, daysAgo(100))
    const s = simulatePoints([earn, redeem], NOW)
    assert.equal(s.balance, 0)
    assert.deepEqual(s.dueExpiries, [{ lotId: earn.id, points: 60 }])
    // once the EXPIRE row exists, nothing is due and the ledger sum equals the balance
    const exp = L('EXPIRE', -60, NOW, null, earn.id)
    const s2 = simulatePoints([earn, redeem, exp], NOW)
    assert.deepEqual(s2.dueExpiries, [])
    assert.equal(s2.balance, [earn, redeem, exp].reduce((a, b) => a + b.points, 0))
  })

  it('spends the soonest-expiring lot first', () => {
    const a = L('EARN', 50, daysAgo(170), daysAgo(-10))
    const b = L('EARN', 50, daysAgo(10), daysAgo(-170))
    const s = simulatePoints([a, b, L('REDEEM', -60, daysAgo(1))], NOW)
    assert.deepEqual(s.lots.map(l => [l.id, l.remaining]), [[b.id, 40]])
  })

  it('negative adjustment beyond balance becomes a deficit repaid by later earnings', () => {
    const e = [L('EARN', 10, daysAgo(30), daysAgo(-150)), L('REDEEM', -10, daysAgo(20)), L('ADJUST', -5, daysAgo(10))]
    assert.equal(simulatePoints(e, NOW).balance, -5)
    const s = simulatePoints([...e, L('EARN', 8, daysAgo(1), daysAgo(-179))], NOW)
    assert.equal(s.balance, 3)
    assert.equal(s.lots[0].remaining, 3)
  })

  it('property: after writing all due EXPIRE rows, ledger sum == simulated balance', () => {
    let seed = 42
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    for (let run = 0; run < 300; run++) {
      const entries: LedgerEntry[] = []
      let day = 400
      for (let i = 0; i < 15; i++) {
        day -= Math.floor(rnd() * 30)
        const at = daysAgo(Math.max(day, 0))
        const bal = simulatePoints(entries, at)
        for (const d of bal.dueExpiries) entries.push(L('EXPIRE', -d.points, at, null, d.lotId))
        const cur = simulatePoints(entries, at).balance
        const r = rnd()
        if (r < 0.5) entries.push(L('EARN', 1 + Math.floor(rnd() * 50), at, new Date(at.getTime() + 180 * DAY_MS)))
        else if (r < 0.8 && cur > 0) entries.push(L('REDEEM', -(1 + Math.floor(rnd() * cur)), at))
        else entries.push(L('ADJUST', rnd() < 0.5 ? -3 : 4, at, new Date(at.getTime() + 180 * DAY_MS)))
      }
      const fin = simulatePoints(entries, NOW)
      for (const d of fin.dueExpiries) entries.push(L('EXPIRE', -d.points, NOW, null, d.lotId))
      const sum = entries.reduce((a, b) => a + b.points, 0)
      assert.equal(simulatePoints(entries, NOW).balance, sum, `run ${run}`)
      assert.deepEqual(simulatePoints(entries, NOW).dueExpiries, [])
    }
  })
})

describe('receipt quote', () => {
  const base = { cfg: ON, vip: { pct: 0, source: null as null }, pointsBalance: 0, canRedeem: true, redeemPoints: 0, applyLoyalty: true }

  it('both modes off → no discount, no points (current behaviour)', () => {
    const q = quoteReceipt({ ...base, cfg: DEFAULT_LOYALTY_CONFIG, grossMnt: 12_000, vip: { pct: 3, source: 'AUTO' }, pointsBalance: 500 })
    assert.equal(q.netMnt, 12_000)
    assert.equal(q.vipDiscountMnt, 0)
    assert.equal(q.pointsEarned, 0)
    assert.equal(q.maxRedeemPoints, 0)
  })

  it('VIP discount floors to whole ₮', () => {
    const q = quoteReceipt({ ...base, grossMnt: 12_345, vip: { pct: 3, source: 'AUTO' } })
    assert.equal(q.vipDiscountMnt, 370) // 370.35 → 370
    assert.equal(q.netMnt, 11_975)
    assert.equal(q.pointsEarned, 11) // ₮1000 = 1 point on the paid part
  })

  it('redeem capped at 50% of the (post-VIP) amount and by balance', () => {
    const q = quoteReceipt({ ...base, grossMnt: 10_000, pointsBalance: 1000, redeemPoints: 0 })
    assert.equal(q.maxRedeemPoints, 250) // 5000₮ / 20₮
    assert.throws(() => quoteReceipt({ ...base, grossMnt: 10_000, pointsBalance: 1000, redeemPoints: 251 }), RedeemError)
    const used = quoteReceipt({ ...base, grossMnt: 10_000, pointsBalance: 1000, redeemPoints: 250 })
    assert.equal(used.pointsRedeemedMnt, 5000)
    assert.equal(used.netMnt, 5000)
    assert.equal(used.pointsEarned, 5) // no points on the part paid with points
    assert.equal(quoteReceipt({ ...base, grossMnt: 10_000, pointsBalance: 40 }).maxRedeemPoints, 40)
  })

  it('unverified / unregistered owner cannot redeem but still earns', () => {
    const q = quoteReceipt({ ...base, grossMnt: 10_000, pointsBalance: 100, canRedeem: false })
    assert.equal(q.maxRedeemPoints, 0)
    assert.equal(q.pointsEarned, 10)
    assert.throws(() => quoteReceipt({ ...base, grossMnt: 10_000, pointsBalance: 100, canRedeem: false, redeemPoints: 1 }), /баталгаажуулсан/)
  })

  it('applyLoyalty=false (self-handover / no phone) disables everything', () => {
    const q = quoteReceipt({ ...base, grossMnt: 10_000, vip: { pct: 5, source: 'MANUAL' }, pointsBalance: 100, applyLoyalty: false })
    assert.deepEqual([q.vipDiscountMnt, q.pointsEarned, q.maxRedeemPoints, q.netMnt], [0, 0, 0, 10_000])
  })

  it('negative or fractional redeem rejected; no cash-out (net never < 0)', () => {
    assert.throws(() => quoteReceipt({ ...base, grossMnt: 1000, pointsBalance: 100, redeemPoints: -1 }), RedeemError)
    assert.throws(() => quoteReceipt({ ...base, grossMnt: 1000, pointsBalance: 100, redeemPoints: 1.5 }), RedeemError)
    const full = quoteReceipt({ ...base, cfg: { ...ON, maxRedeemPct: 100 }, grossMnt: 1000, pointsBalance: 100, redeemPoints: 50 })
    assert.equal(full.netMnt, 0)
    assert.throws(() => quoteReceipt({ ...base, cfg: { ...ON, maxRedeemPct: 100 }, grossMnt: 1000, pointsBalance: 100, redeemPoints: 51 }), RedeemError)
  })

  it('handles decimal prices exactly', () => {
    const q = quoteReceipt({ ...base, grossMnt: 0.1 + 0.2, vip: { pct: 1, source: 'AUTO' } })
    assert.equal(q.grossMnt, 0.3)
  })
})

describe('price change after handover', () => {
  const terms = { vipEnabled: true, vipPct: 2, pointsEnabled: true, earnMntPerPoint: 1000, pointsRedeemedMnt: 0 }
  it('recomputes with the receipt terms', () => {
    assert.deepEqual(receiptOutcome(terms, 10_000), { vipDiscountMnt: 200, netMnt: 9800, pointsEarned: 9 })
    assert.deepEqual(priceChangeCompensation(terms, 10_000, 20_000, 9), { vipDiscountDeltaMnt: 200, pointsDelta: 10 })
    assert.deepEqual(priceChangeCompensation(terms, 10_000, 2_000, 9), { vipDiscountDeltaMnt: -160, pointsDelta: -8 })
    // second edit uses the points already granted (earn + previous adjustments)
    assert.deepEqual(priceChangeCompensation(terms, 20_000, 10_000, 19), { vipDiscountDeltaMnt: -200, pointsDelta: -10 })
  })
  it('no points when the receipt had points off', () => {
    assert.equal(priceChangeCompensation({ ...terms, pointsEnabled: false }, 1000, 50_000, 0).pointsDelta, 0)
  })
})

describe('helpers', () => {
  it('owner phone prefers the shipment phone', () => {
    assert.equal(ownerPhoneOf({ phone: '99112233', user: { phone: '88112233' } }), '99112233')
    assert.equal(ownerPhoneOf({ phone: null, user: { phone: '88112233' } }), '88112233')
    assert.equal(ownerPhoneOf({ phone: ' ', user: null }), null)
  })
  it('UB month range', () => {
    const r = ubMonthRange('2026-12')!
    assert.equal(r.start.toISOString(), '2026-11-30T16:00:00.000Z')
    assert.equal(r.end.toISOString(), '2026-12-31T15:59:59.999Z')
    assert.equal(ubMonthRange('2026-13'), null)
    assert.equal(ubMonthOf(new Date('2026-11-30T16:30:00Z')), '2026-12')
  })
})

describe('handover revert (VOID rows)', () => {
  it('consumedLots tells which lots a REDEEM used, with their expiry', () => {
    const a = L('EARN', 50, daysAgo(170), daysAgo(-10))
    const b = L('EARN', 50, daysAgo(10), daysAgo(-170))
    const r = L('REDEEM', -60, daysAgo(1))
    assert.deepEqual(consumedLots([a, b, r], r.id, NOW), [
      { lotId: a.id, points: 50, expiresAt: a.expiresAt },
      { lotId: b.id, points: 10, expiresAt: b.expiresAt },
    ])
    assert.deepEqual(consumedLots([a, b], 999, NOW), [])
  })

  it('refund + reversal restore the exact pre-handover balance and lots', () => {
    const old = L('EARN', 700, daysAgo(175), daysAgo(-5))      // expires in 5 days
    const before = simulatePoints([old], NOW)
    // handover: redeem 490 (from the expiring lot), earn 9
    const red = L('REDEEM', -490, daysAgo(1))
    const earn = L('EARN', 9, daysAgo(1), daysAgo(-179))
    const parts = consumedLots([old, red, earn], red.id, NOW)
    const refunds = parts.map(p => L('VOID', p.points, NOW, p.expiresAt, red.id))
    const rev = L('VOID', -9, NOW, null, earn.id)
    const after = simulatePoints([old, red, earn, ...refunds, rev], NOW)
    assert.equal(after.balance, before.balance)
    assert.deepEqual(after.expiringSoon, before.expiringSoon) // 700 still expire in 5 days, not extended
  })

  it('negative VOID takes from the referenced lot first, not FIFO', () => {
    const a = L('EARN', 50, daysAgo(170), daysAgo(-10))
    const b = L('EARN', 20, daysAgo(1), daysAgo(-179))
    const s = simulatePoints([a, b, L('VOID', -20, NOW, null, b.id)], NOW)
    assert.deepEqual(s.lots.map(l => [l.id, l.remaining]), [[a.id, 50]])
  })

  it('reversal of already-spent points leaves a deficit instead of vanishing', () => {
    const e = L('EARN', 30, daysAgo(10), daysAgo(-170))
    const r = L('REDEEM', -30, daysAgo(5))                       // spent in another handover
    assert.equal(simulatePoints([e, r, L('VOID', -30, NOW, null, e.id)], NOW).balance, -30)
  })

  it('refund of points whose original lot has since expired comes back already expired', () => {
    const lot = L('EARN', 100, daysAgo(200), daysAgo(20))
    const red = L('REDEEM', -100, daysAgo(30))
    const parts = consumedLots([lot, red], red.id, NOW)
    const ref = L('VOID', parts[0].points, NOW, parts[0].expiresAt, red.id)
    const s = simulatePoints([lot, red, ref], NOW)
    assert.equal(s.balance, 0)
    assert.deepEqual(s.dueExpiries, [{ lotId: ref.id, points: 100 }])
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CustomerLoyaltyView, VipTier } from './loyalty-core'
import { cardLayout, hintText, maxRedeemFor, nextTier, pickHint, posOf, redeemFact, seenDiff, parseSeen, vipKey, tgK } from './loyalty-view'

const NOW = new Date('2026-11-11T04:00:00Z')
const DEF: VipTier[] = [{ minSpend: 90000, pct: 1 }, { minSpend: 190000, pct: 2 }, { minSpend: 290000, pct: 3 }, { minSpend: 730000, pct: 5 }]
const pts = (o: Partial<NonNullable<CustomerLoyaltyView['points']>> = {}) => ({
  balance: 340, valueMnt: 6800, pointValueMnt: 20, earnMntPerPoint: 1000, maxRedeemPct: 100, expiryDays: 180, expiringSoon: null, canRedeem: true, ...o,
})
const vip = (o: Partial<NonNullable<CustomerLoyaltyView['vip']>> = {}) => ({
  pct: 1, source: 'AUTO' as const, spend: 152000, held: false, next: null, windowDays: 90, graceDays: 30, tiers: DEF, manualUntil: null, ...o,
})
const view = (o: Partial<CustomerLoyaltyView> = {}): CustomerLoyaltyView => ({ cargoId: 1, points: pts(), vip: vip(), receipts: [], ...o })

describe('loyalty card visibility per enabled program', () => {
  it('both / vip-only / points-only / hidden', () => {
    assert.equal(cardLayout(view()), 'both')
    assert.equal(cardLayout(view({ points: null })), 'vip')
    assert.equal(cardLayout(view({ vip: null })), 'points')
    assert.equal(cardLayout(view({ vip: null, points: null })), null)
    assert.equal(cardLayout(null), null)
  })
  it('points-only never yields VIP hints; vip-only never yields point hints', () => {
    const p = view({ vip: null, points: pts({ balance: 0, valueMnt: 0 }) })
    assert.deepEqual(pickHint(p, 0, NOW), { kind: 'empty' })
    assert.deepEqual(pickHint(p, 20000, NOW), { kind: 'empty' }) // no points to redeem, no VIP hints
    assert.equal(pickHint(view({ vip: null, points: pts({ balance: 10, valueMnt: 200, canRedeem: true, maxRedeemPct: 0 }) }), 20000, NOW), null)
    const v = view({ points: null, vip: vip({ pct: 2, spend: 220000 }) })
    assert.deepEqual(pickHint(v, 20000, NOW), { kind: 'vipDiscount', mnt: 400 })
  })
})

describe('dynamic VIP tiers (1–5 from admin settings)', () => {
  it('posOf splits the bar into N equal parts for any tier count', () => {
    assert.equal(posOf(0, DEF), 0)
    assert.equal(posOf(90000, DEF), 25)
    assert.equal(posOf(140000, DEF), 37.5)
    assert.equal(posOf(800000, DEF), 100)
    const one = [{ minSpend: 100000, pct: 3 }]
    assert.equal(posOf(50000, one), 50)
    assert.equal(posOf(100000, one), 100)
    const two = [{ minSpend: 50000, pct: 2 }, { minSpend: 150000, pct: 4 }]
    assert.equal(posOf(100000, two), 75)
    const five = [30000, 80000, 150000, 300000, 600000].map((m, i) => ({ minSpend: m, pct: i + 1 }))
    assert.equal(posOf(80000, five), 40)
    assert.equal(posOf(0, []), 0)
  })
  it('nextTier/vipKey read thresholds from the configured tiers, not defaults', () => {
    const two = [{ minSpend: 50000, pct: 2 }, { minSpend: 150000, pct: 4 }]
    assert.deepEqual(nextTier(vip({ pct: 2, spend: 60000, tiers: two })), { minSpend: 150000, pct: 4, remaining: 90000 })
    assert.deepEqual(vipKey(vip({ pct: 2, spend: 60000, tiers: two })), { kind: 'progress', remaining: 90000, nextPct: 4 })
    assert.deepEqual(vipKey(vip({ pct: 4, spend: 160000, tiers: two })), { kind: 'max' })
    assert.deepEqual(vipKey(vip({ pct: 0, spend: 36000 })), { kind: 'progress', remaining: 54000, nextPct: 1 }) // locked
    assert.deepEqual(vipKey(vip({ pct: 2, spend: 160000, held: true })), { kind: 'held', keepMnt: 30000 })
  })
  it('manual VIP above any tier: «Онцгой» key with its date; next tier is above the manual pct', () => {
    const m = vip({ pct: 4, source: 'MANUAL', spend: 30000, manualUntil: '2026-12-31T00:00:00.000Z' })
    assert.deepEqual(vipKey(m), { kind: 'manual', until: '2026-12-31T00:00:00.000Z' })
    assert.equal(nextTier(m)!.pct, 5)
    assert.deepEqual(vipKey(vip({ pct: 5, source: 'MANUAL', spend: 0 })), { kind: 'max' })
  })
  it('tier chips label', () => { assert.equal(tgK(90000), '₮90 мян'); assert.equal(tgK(1500000), '₮1.5 сая'); assert.equal(tgK(500), '₮500') })
})

describe('hint priority', () => {
  it('verify > redeem > unlockNext > expiring > vipDiscount > held > empty', () => {
    assert.deepEqual(pickHint(view({ points: pts({ canRedeem: false }) }), 48000, NOW), { kind: 'verify' })
    assert.deepEqual(pickHint(view(), 48000, NOW), { kind: 'redeem', mnt: 6800 })
    assert.deepEqual(pickHint(view({ points: pts({ balance: 0, valueMnt: 0 }), vip: vip({ spend: 172000 }) }), 48000, NOW), { kind: 'unlockNext', pct: 2 })
    const exp = { points: 63, at: '2026-11-30T00:00:00.000Z' }
    assert.deepEqual(pickHint(view({ points: pts({ expiringSoon: exp }) }), 0, NOW), { kind: 'expiring', ...exp })
    assert.equal(pickHint(view({ points: pts({ expiringSoon: { points: 63, at: '2027-03-02T00:00:00.000Z' } }) }), 0, NOW), null)
    assert.deepEqual(pickHint(view({ points: pts({ canRedeem: true, balance: 0, valueMnt: 0 }) }), 10000, NOW), { kind: 'vipDiscount', mnt: 100 })
    assert.deepEqual(pickHint(view({ points: null, vip: vip({ pct: 2, held: true, spend: 160000 }) }), 0, NOW), { kind: 'held', days: 30 })
    assert.deepEqual(pickHint(view({ points: pts({ balance: 0, valueMnt: 0 }), vip: vip({ pct: 0, spend: 0 }) }), 0, NOW), { kind: 'empty' })
    assert.equal(hintText({ kind: 'redeem', mnt: 6800 }), 'Ачаа авахдаа ₮6,800 хүртэл хасуулна')
  })
  it('maxRedeemPct = 0 never shows the redeem hint', () => {
    assert.equal(maxRedeemFor(view({ points: pts({ maxRedeemPct: 0 }) }), 48000), 0)
    assert.notEqual(pickHint(view({ points: pts({ maxRedeemPct: 0 }) }), 48000, NOW)?.kind, 'redeem')
  })
})

describe('100% redemption', () => {
  it('cap = full amount after VIP when maxRedeemPct is 100; bounded by balance', () => {
    // ₮20,000 −2% = ₮19,600 → 980 pts at 100%, 490 at 50%
    assert.equal(maxRedeemFor(view({ vip: vip({ pct: 2 }), points: pts({ balance: 5000 }) }), 20000), 980)
    assert.equal(maxRedeemFor(view({ vip: vip({ pct: 2 }), points: pts({ balance: 5000, maxRedeemPct: 50 }) }), 20000), 490)
    assert.equal(maxRedeemFor(view({ vip: vip({ pct: 2 }), points: pts({ balance: 920 }) }), 20000), 920)
    assert.equal(maxRedeemFor(view({ vip: null, points: pts({ balance: 5000, canRedeem: false }) }), 20000), 0)
  })
  it('details label «Бүтэн төлж болно» at ≥100%', () => {
    assert.equal(redeemFact(100), 'Бүтэн төлж болно')
    assert.equal(redeemFact(50), '50% хүртэл')
    assert.equal(redeemFact(0), null)
  })
})

describe('seen state (celebrate once per unlock)', () => {
  const rc = (id: number, pointsEarned: number) => ({ id, createdAt: '2026-11-11', itemCount: 1, grossMnt: 1, vipPct: 0, vipDiscountMnt: 0, pointsRedeemed: 0, pointsRedeemedMnt: 0, netMnt: 1, pointsEarned })
  it('first load only stores — no toast, no celebration', () => {
    const d = seenDiff(null, view({ vip: vip({ pct: 2 }), receipts: [rc(7, 20)] }))
    assert.deepEqual(d, { toastPoints: 0, unlockPct: null, next: { pct: 2, lastReceiptId: 7 } })
  })
  it('new receipt → toast; higher pct → celebration; same state again → nothing', () => {
    const v = view({ vip: vip({ pct: 1 }), receipts: [rc(9, 55), rc(8, 5), rc(7, 20)] })
    const d = seenDiff({ pct: 0, lastReceiptId: 7 }, v)
    assert.deepEqual(d, { toastPoints: 60, unlockPct: 1, next: { pct: 1, lastReceiptId: 9 } })
    assert.deepEqual(seenDiff(d.next, v), { toastPoints: 0, unlockPct: null, next: d.next })
  })
  it('points-only: toast but never a celebration; seen pct kept for when VIP returns', () => {
    const d = seenDiff({ pct: 2, lastReceiptId: 1 }, view({ vip: null, receipts: [rc(3, 19)] }))
    assert.deepEqual(d, { toastPoints: 19, unlockPct: null, next: { pct: 2, lastReceiptId: 3 } })
  })
  it('vip-only: celebration without points toast; pct drop stored so a later re-unlock celebrates', () => {
    assert.deepEqual(seenDiff({ pct: 1, lastReceiptId: 1 }, view({ points: null, vip: vip({ pct: 2 }), receipts: [rc(2, 30)] })).toastPoints, 0)
    assert.equal(seenDiff({ pct: 2, lastReceiptId: 1 }, view({ vip: vip({ pct: 1 }) })).next.pct, 1)
  })
  it('parseSeen tolerates garbage', () => {
    assert.equal(parseSeen(null), null); assert.equal(parseSeen('{'), null); assert.equal(parseSeen('{"pct":"x"}'), null)
    assert.deepEqual(parseSeen('{"pct":2,"lastReceiptId":5}'), { pct: 2, lastReceiptId: 5 })
  })
})

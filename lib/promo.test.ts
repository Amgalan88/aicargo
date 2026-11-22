import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_TIERS, cleanTiers, maskName, maskPhone, normalizeCode, tiersOf } from './promo'
import { DEFAULT_LOYALTY_CONFIG, quoteReceipt } from './loyalty-core'

describe('promo tiers', () => {
  it('accepts the default six tiers and sorts by percent', () => {
    assert.deepEqual(cleanTiers([...DEFAULT_TIERS].reverse()), DEFAULT_TIERS)
  })
  it('rejects duplicates, out-of-range percents and empty names', () => {
    assert.equal(cleanTiers([{ name: 'A', pct: 5 }, { name: 'a', pct: 10 }]), null)
    assert.equal(cleanTiers([{ name: 'A', pct: 5 }, { name: 'B', pct: 5 }]), null)
    assert.equal(cleanTiers([{ name: 'A', pct: 51 }]), null)
    assert.equal(cleanTiers([{ name: 'A', pct: 0 }]), null)
    assert.equal(cleanTiers([{ name: ' ', pct: 5 }]), null)
    assert.equal(cleanTiers([]), null)
  })
  it('falls back to the defaults when stored tiers are missing or broken', () => {
    assert.deepEqual(tiersOf(null), DEFAULT_TIERS)
    assert.deepEqual(tiersOf([{ name: 'x', pct: 99 }]), DEFAULT_TIERS)
  })
})

describe('promo codes and masking', () => {
  it('normalizes codes to upper case and rejects bad ones', () => {
    assert.equal(normalizeCode(' bold10 '), 'BOLD10')
    assert.equal(normalizeCode('a'), null)
    assert.equal(normalizeCode('БОЛД'), null)
    assert.equal(normalizeCode('X'.repeat(21)), null)
  })
  it('masks names and phones for the agent page', () => {
    assert.equal(maskName('Болормаа'), 'Бо***')
    assert.equal(maskName(null), '—')
    assert.equal(maskPhone('99112233'), '99****33')
  })
})

describe('discount cap', () => {
  const cfg = { ...DEFAULT_LOYALTY_CONFIG, vipEnabled: true }
  const base = { grossMnt: 10_000, pointsBalance: 0, canRedeem: false, redeemPoints: 0, applyLoyalty: true }
  it('keeps the 5% cap for ordinary cargos', () => {
    const q = quoteReceipt({ ...base, cfg, vip: { pct: 30, source: 'MANUAL' } })
    assert.equal(q.vipPct, 5)
    assert.equal(q.netMnt, 9_500)
  })
  it('allows up to 50% for promo cargos', () => {
    const q = quoteReceipt({ ...base, cfg: { ...cfg, maxVipPct: 50 }, vip: { pct: 30, source: 'MANUAL' } })
    assert.equal(q.vipPct, 30)
    assert.equal(q.vipDiscountMnt, 3_000)
    assert.equal(q.netMnt, 7_000)
  })
})

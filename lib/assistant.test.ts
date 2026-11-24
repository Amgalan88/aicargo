import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { groupWaiting, tg } from './assistant'
import { pageHelp } from './assistant-pages'

const now = new Date('2026-11-24T04:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

describe('assistant waiting groups', () => {
  it('groups by phone, sums amounts and keeps the oldest wait first', () => {
    const g = groupWaiting([
      { phone: '99112233', userId: 5, adminPrice: 3000, arrivedAt: daysAgo(9), updatedAt: now },
      { phone: '99112233', userId: 5, adminPrice: '4500.00', arrivedAt: daysAgo(12), updatedAt: now },
      { phone: '88001122', userId: null, adminPrice: null, arrivedAt: null, updatedAt: daysAgo(20) },
      { phone: null, userId: null, adminPrice: 1000, arrivedAt: daysAgo(8), updatedAt: now },
      { phone: '  ', userId: null, adminPrice: 500, arrivedAt: daysAgo(10), updatedAt: now },
    ], now)
    assert.deepEqual(g.map(x => [x.phone, x.count, x.amount, x.days]), [
      ['88001122', 1, 0, 20],
      ['99112233', 2, 7500, 12],
      ['', 2, 1500, 10],
    ])
    assert.equal(g[1].userId, 5)
  })
})

describe('assistant helpers', () => {
  it('formats tugrik', () => assert.equal(tg(612000.4), '₮612,000'))
  it('explains a page by its longest matching path', () => {
    assert.match(pageHelp('/admin/arrived'), /ирсэн ачааг бүртгэнэ/)
    assert.match(pageHelp('/admin/promo/'), /промо код/i)
    assert.match(pageHelp('/admin'), /«Өнөөдөр» самбар/)
    assert.match(pageHelp('/admin/unknown-page'), /одоохондоо алга/)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  scanArrival, parseScanPrice, alreadyArrivedMessage, formatUbDateTime, partitionArrivalImport, isArrivedOrLater,
  NO_PHONE_ARRIVAL_MESSAGE, skippedNoPhoneCodes, countInsertedWithoutPrice, skippedNoPhoneLabel, noPriceLabel,
  type ArrivalScanStore, type ArrivalWrite,
} from './arrival-scan'

type Row = {
  id: number; status: string; arrivedAt: Date | null; adminPrice: number | null
  adminNote: string | null; phone: string | null; userId: number | null
}

// Prisma-тай ижил: data-д байхгүй талбар хөндөгдөхгүй; updateIfNotArrived нь status NOT IN (ARRIVED, PICKED_UP) хамгаалалттай
function memoryStore(initial: Partial<Row> | null, opts: {
  beforeUpdate?: (row: Row) => void
  owner?: (existing: Row | null) => { phone: string | null; userId: number | null }
} = {}) {
  let row: Row | null = initial
    ? { id: 1, status: 'REGISTERED', arrivedAt: null, adminPrice: null, adminNote: null, phone: '99112233', userId: 7, ...initial }
    : null
  const calls = { create: 0, update: 0, owner: 0, writes: [] as ArrivalWrite[] }
  const store: ArrivalScanStore<Row> = {
    find: async () => (row ? { ...row } : null),
    owner: async existing => {
      calls.owner++
      if (opts.owner) return opts.owner(existing)
      return { phone: existing?.phone ?? '99112233', userId: existing?.userId ?? 7 }
    },
    create: async data => {
      calls.create++
      if (row) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
      calls.writes.push(data)
      row = { id: 1, adminPrice: null, ...data }
      return { ...row }
    },
    updateIfNotArrived: async (id, data) => {
      calls.update++
      if (row && opts.beforeUpdate) opts.beforeUpdate(row)
      if (!row || row.id !== id || isArrivedOrLater(row.status)) return null
      calls.writes.push(data)
      row = { ...row, ...data }
      return { ...row }
    },
  }
  return { store, calls, get: () => row }
}

// JT9002912952476 (Bongo): 2026-11-09 19:37 УБ-д ирсэн, 20:12-т дахин уншуулсан
const FIRST = new Date('2026-11-09T11:37:00Z')
const LATER = new Date('2026-11-09T12:12:00Z')

describe('first arrival scan', () => {
  it('creates a new shipment as ARRIVED with the scan time and price', async () => {
    const db = memoryStore(null)
    const r = await scanArrival(db.store, { price: '5000', note: '' }, FIRST)
    assert.equal(r.kind, 'arrived')
    assert.equal(db.get()!.status, 'ARRIVED')
    assert.equal(db.get()!.arrivedAt!.getTime(), FIRST.getTime())
    assert.equal(db.get()!.adminPrice, 5000)
  })

  it('moves an EREEN_ARRIVED shipment to ARRIVED with the scan time', async () => {
    const db = memoryStore({ status: 'EREEN_ARRIVED' })
    const r = await scanArrival(db.store, { price: 4500, note: 'гутал' }, FIRST)
    assert.equal(r.kind, 'arrived')
    assert.equal(r.kind === 'arrived' && r.previousStatus, 'EREEN_ARRIVED')
    assert.deepEqual(
      { status: db.get()!.status, arrivedAt: db.get()!.arrivedAt, adminPrice: db.get()!.adminPrice, adminNote: db.get()!.adminNote },
      { status: 'ARRIVED', arrivedAt: FIRST, adminPrice: 4500, adminNote: 'гутал' },
    )
  })
})

describe('re-scan of an ARRIVED shipment', () => {
  it('keeps arrival time and price and returns already-arrived', async () => {
    const db = memoryStore({ status: 'ARRIVED', arrivedAt: FIRST, adminPrice: 5000 })
    const r = await scanArrival(db.store, { price: '', note: '' }, LATER)
    assert.equal(r.kind, 'already-arrived')
    assert.equal(r.kind === 'already-arrived' && r.message, 'Аль хэдийн ирсэн байна (ирсэн: 2026.11.09 19:37, ₮5,000)')
    assert.equal(db.get()!.arrivedAt!.getTime(), FIRST.getTime())
    assert.equal(db.get()!.adminPrice, 5000)
    assert.equal(db.get()!.status, 'ARRIVED')
    assert.deepEqual({ create: db.calls.create, update: db.calls.update, owner: db.calls.owner }, { create: 0, update: 0, owner: 0 })
  })

  it('ignores a different price typed on the re-scan', async () => {
    const db = memoryStore({ status: 'ARRIVED', arrivedAt: FIRST, adminPrice: 5000 })
    const r = await scanArrival(db.store, { price: '9000', note: 'шинэ' }, LATER)
    assert.equal(r.kind, 'already-arrived')
    assert.equal(db.get()!.adminPrice, 5000)
    assert.equal(db.get()!.adminNote, null)
  })

  it('three scans in a row keep the first arrival time', async () => {
    const db = memoryStore({ status: 'EREEN_ARRIVED' })
    const kinds = []
    for (const [i, at] of [FIRST, LATER, new Date(LATER.getTime() + 60_000)].entries()) {
      kinds.push((await scanArrival(db.store, { price: i === 0 ? '5000' : '', note: '' }, at)).kind)
    }
    assert.deepEqual(kinds, ['arrived', 'already-arrived', 'already-arrived'])
    assert.equal(db.get()!.arrivedAt!.getTime(), FIRST.getTime())
    assert.equal(db.get()!.adminPrice, 5000)
  })

  it('a concurrent scan that wins the race is reported as already-arrived, not overwritten', async () => {
    const db = memoryStore({ status: 'EREEN_ARRIVED' }, {
      beforeUpdate: row => { if (row.status !== 'ARRIVED') Object.assign(row, { status: 'ARRIVED', arrivedAt: FIRST, adminPrice: 5000 }) },
    })
    const r = await scanArrival(db.store, { price: '', note: '' }, LATER)
    assert.equal(r.kind, 'already-arrived')
    assert.equal(db.get()!.arrivedAt!.getTime(), FIRST.getTime())
    assert.equal(db.get()!.adminPrice, 5000)
  })

  it('a concurrent create (unique conflict) is reported as already-arrived', async () => {
    // Эхний уншилт хоосон байсан ч нөгөө уншуулалт энэ хооронд үүсгэчихсэн
    const db = memoryStore({ status: 'ARRIVED', arrivedAt: FIRST, adminPrice: 5000 })
    const find = db.store.find
    let stale = true
    db.store.find = async () => (stale ? ((stale = false), null) : find())
    const r = await scanArrival(db.store, { price: '', note: '' }, LATER)
    assert.equal(r.kind, 'already-arrived')
    assert.equal(db.calls.create, 1)
    assert.equal(db.get()!.arrivedAt!.getTime(), FIRST.getTime())
    assert.equal(db.get()!.adminPrice, 5000)
  })
})

describe('blank price never clears an existing price', () => {
  for (const blank of ['', '   ', null, undefined, 'abc', '-5']) {
    it(`keeps the existing price when the scan price is ${JSON.stringify(blank)}`, async () => {
      const db = memoryStore({ status: 'EREEN_ARRIVED', adminPrice: 3000 })
      const r = await scanArrival(db.store, { price: blank, note: '' }, FIRST)
      assert.equal(r.kind, 'arrived')
      assert.equal(db.get()!.adminPrice, 3000)
      assert.equal('adminPrice' in db.calls.writes[0], false)
    })
  }

  it('does not write a price key on create when blank', async () => {
    const db = memoryStore(null)
    await scanArrival(db.store, { price: '', note: '' }, FIRST)
    assert.equal('adminPrice' in db.calls.writes[0], false)
    assert.equal(db.get()!.adminPrice, null)
  })

  it('parseScanPrice treats blank/invalid as "keep" and accepts an explicit 0', () => {
    assert.equal(parseScanPrice(''), undefined)
    assert.equal(parseScanPrice(null), undefined)
    assert.equal(parseScanPrice(' 1500 '), 1500)
    assert.equal(parseScanPrice(2500), 2500)
    assert.equal(parseScanPrice('0'), 0)
  })
})

describe('handed-over (PICKED_UP) shipment re-scan', () => {
  it('does not revert status, time or price', async () => {
    const db = memoryStore({ status: 'PICKED_UP', arrivedAt: FIRST, adminPrice: 5000 })
    const r = await scanArrival(db.store, { price: '', note: '' }, LATER)
    assert.equal(r.kind, 'already-arrived')
    assert.equal(r.kind === 'already-arrived' && r.message, 'Аль хэдийн олгогдсон байна (ирсэн: 2026.11.09 19:37, ₮5,000)')
    assert.deepEqual(
      { status: db.get()!.status, arrivedAt: db.get()!.arrivedAt, adminPrice: db.get()!.adminPrice },
      { status: 'PICKED_UP', arrivedAt: FIRST, adminPrice: 5000 },
    )
    assert.equal(db.calls.writes.length, 0)
  })
})

describe('phone-less arrival is refused (mocked, no database)', () => {
  const none = () => ({ phone: null, userId: null })

  it('does not create an ARRIVED shipment when the scan has no phone and no owner', async () => {
    const db = memoryStore(null, { owner: none })
    const r = await scanArrival(db.store, { price: '5000', note: '' }, FIRST)
    assert.equal(r.kind, 'no-phone')
    assert.equal(r.kind === 'no-phone' && r.message, NO_PHONE_ARRIVAL_MESSAGE)
    assert.equal(db.get(), null)
    assert.deepEqual({ create: db.calls.create, update: db.calls.update }, { create: 0, update: 0 })
  })

  it('does not promote an owner-less shipment to ARRIVED', async () => {
    const db = memoryStore({ status: 'EREEN_ARRIVED', phone: null, userId: null, adminPrice: 3000 }, { owner: none })
    const r = await scanArrival(db.store, { price: '', note: '' }, FIRST)
    assert.equal(r.kind, 'no-phone')
    assert.equal(db.get()!.status, 'EREEN_ARRIVED')
    assert.equal(db.get()!.adminPrice, 3000)
    assert.equal(db.calls.writes.length, 0)
  })

  it('arrives when there is no typed phone but the shipment already has an owner', async () => {
    const db = memoryStore({ status: 'REGISTERED', phone: '99110011', userId: 3 }, {
      owner: existing => ({ phone: existing?.phone ?? null, userId: existing?.userId ?? null }),
    })
    const r = await scanArrival(db.store, { price: '', note: '' }, FIRST)
    assert.equal(r.kind, 'arrived')
    assert.equal(db.get()!.status, 'ARRIVED')
    assert.equal(db.get()!.phone, '99110011')
    assert.equal(db.get()!.userId, 3)
  })

  it('arrives a new shipment that has a phone but no user account', async () => {
    const db = memoryStore(null, { owner: () => ({ phone: '88001122', userId: null }) })
    const r = await scanArrival(db.store, { price: '1500', note: '' }, FIRST)
    assert.equal(r.kind, 'arrived')
    assert.equal(db.get()!.phone, '88001122')
    assert.equal(db.get()!.userId, null)
    assert.equal(db.get()!.adminPrice, 1500)
  })

  it('treats a user id without a phone as an existing owner', async () => {
    const db = memoryStore(null, { owner: () => ({ phone: null, userId: 9 }) })
    const r = await scanArrival(db.store, { price: '0', note: '' }, FIRST)
    assert.equal(r.kind, 'arrived')
    assert.equal(db.get()!.userId, 9)
    assert.equal(db.get()!.adminPrice, 0)
  })

  it('still reports an already-arrived phone-less shipment without writing', async () => {
    const db = memoryStore({ status: 'ARRIVED', arrivedAt: FIRST, adminPrice: null, phone: null, userId: null }, { owner: none })
    const r = await scanArrival(db.store, { price: '9000', note: '' }, LATER)
    assert.equal(r.kind, 'already-arrived')
    assert.equal(db.get()!.status, 'ARRIVED')
    assert.equal(db.get()!.arrivedAt!.getTime(), FIRST.getTime())
    assert.equal(db.calls.owner, 0)
    assert.equal(db.calls.writes.length, 0)
  })
})

describe('import skip and price-less count (mocked, no database)', () => {
  it('skips fresh rows with no phone and no owner, and keeps rows that already arrived', () => {
    const existing = new Map<string, { status: string }>([
      ['OWNED', { status: 'REGISTERED' }],
      ['ARR', { status: 'ARRIVED' }],
      ['PICK', { status: 'PICKED_UP' }],
      ['BARE', { status: 'EREEN_ARRIVED' }],
    ])
    const codes = ['OWNED', 'ARR', 'PICK', 'BARE', 'NEWPHONE', 'NEWBARE', 'USERONLY']
    const owners = [
      { phone: '99112233', userId: 1 },
      { phone: null, userId: null },
      { phone: null, userId: null },
      { phone: null, userId: null },
      { phone: '88001122', userId: null },
      { phone: null, userId: null },
      { phone: null, userId: 4 },
    ]
    assert.deepEqual(skippedNoPhoneCodes(codes, owners, existing), ['BARE', 'NEWBARE'])
    const fresh = partitionArrivalImport(codes, existing).fresh.filter(c => !skippedNoPhoneCodes(codes, owners, existing).includes(c))
    assert.deepEqual(fresh, ['OWNED', 'NEWPHONE', 'USERONLY'])
    assert.equal(skippedNoPhoneLabel(2), 'Утасгүй тул орсонгүй: 2 ачаа')
  })

  it('counts only inserted rows that end up without a price', () => {
    const existing = new Map<string, { adminPrice?: unknown }>([
      ['KEEP', { adminPrice: 3000 }],
      ['EMPTY', { adminPrice: null }],
      ['ZERO', { adminPrice: 0 }],
    ])
    const prices = new Map<string, unknown>([
      ['KEEP', ''],
      ['EMPTY', '   '],
      ['ZERO', ''],
      ['NEW', undefined],
      ['PRICED', '1500'],
      ['FREEZERO', '0'],
    ])
    assert.equal(countInsertedWithoutPrice(['KEEP', 'EMPTY', 'ZERO', 'NEW', 'PRICED', 'FREEZERO'], prices, existing), 2)
    assert.equal(countInsertedWithoutPrice(['KEEP', 'PRICED', 'FREEZERO'], prices, existing), 0)
    assert.equal(noPriceLabel(2), '2 ачаа үнэгүй орлоо')
  })
})

describe('messages and Excel partition', () => {
  it('formats arrival time in Ulaanbaatar time and handles missing data', () => {
    assert.equal(formatUbDateTime(new Date('2026-11-09T20:30:00Z')), '2026.11.10 04:30')
    assert.equal(alreadyArrivedMessage({ status: 'ARRIVED', arrivedAt: null, adminPrice: null }), 'Аль хэдийн ирсэн байна (ирсэн: —, үнэгүй)')
    assert.equal(alreadyArrivedMessage({ status: 'ARRIVED', arrivedAt: '2026-11-09T11:37:00.000Z', adminPrice: '12500' }), 'Аль хэдийн ирсэн байна (ирсэн: 2026.11.09 19:37, ₮12,500)')
  })

  it('splits an Excel import into new, already-arrived and handed-over rows', () => {
    const existing = new Map([
      ['A', { status: 'REGISTERED' }], ['B', { status: 'EREEN_ARRIVED' }],
      ['C', { status: 'ARRIVED' }], ['D', { status: 'PICKED_UP' }],
    ])
    assert.deepEqual(partitionArrivalImport(['A', 'B', 'C', 'D', 'E'], existing), {
      fresh: ['A', 'B', 'E'], alreadyArrived: ['C'], pickedUp: ['D'],
    })
  })
})

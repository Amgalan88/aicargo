// Бодит Postgres дээрх integration тест. ЗӨВХӨН localhost DB — алсын DB-д хэзээ ч ажиллахгүй (доорх хамгаалалт).
//   LOYALTY_TEST_PG=postgresql://postgres@127.0.0.1:54329 npx tsx --test lib/loyalty.db.test.ts
// Тест бүр шинэ DB үүсгэнэ: (урамшуулалгүй үндсэн схем) → scripts/loyalty-ddl.ts → schema.prisma-тай харьцуулна.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from 'pg'
import type { PrismaClient } from '@prisma/client'
import { LOYALTY_DDL } from '../scripts/loyalty-ddl'
import { DAY_MS } from './loyalty-core'

const PG = process.env.LOYALTY_TEST_PG
const skip = !PG ? 'LOYALTY_TEST_PG тохируулаагүй (локал Postgres)' : false
if (PG && !/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(PG)) {
  throw new Error('LOYALTY_TEST_PG зөвхөн localhost байх ёстой')
}
const DB = `aicargo_loyalty_test_${process.pid}`
const URL = `${PG?.replace(/\/$/, '')}/${DB}`

let prisma: PrismaClient
let L: typeof import('./loyalty')
const NOW = new Date('2026-11-11T04:00:00Z')
const ago = (d: number) => new Date(NOW.getTime() - d * DAY_MS)
let keyN = 0
const key = () => `test-key-${process.pid}-${++keyN}`

// Урамшууллын өмнөх схем: schema.prisma-аас шинэ загвар, талбаруудыг хасна
function baseSchema(): string {
  const full = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8')
  const head = full.slice(0, full.indexOf('// ── Урамшуулал'))
  return head.split('\n').filter(l =>
    !/LoyaltySettings|LoyaltyAccount|LoyaltyLedger|HandoverReceipt|ShipmentPriceChange|receiptId|@@index\(\[cargoId, phone, status\]\)/.test(l),
  ).join('\n')
}

function prismaCli(args: string[], env: Record<string, string> = {}) {
  return execFileSync(join(__dirname, '..', 'node_modules', '.bin', 'prisma'), args, {
    cwd: join(__dirname, '..'), env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function sql(text: string, params: unknown[] = []) {
  const c = new Client({ connectionString: URL })
  await c.connect()
  try { return (await c.query(text, params)).rows } finally { await c.end() }
}

interface Seed { cargoA: number; cargoB: number; adminA: { id: number; name: string; phone: string | null }; adminB: { id: number; name: string; phone: string | null } }
let S: Seed
let trackN = 0

async function shipment(cargoId: number, phone: string | null, price: number | null, status: 'ARRIVED' | 'PICKED_UP' = 'ARRIVED', updatedAt = NOW, userId: number | null = null) {
  const s = await prisma.shipment.create({
    data: { trackCode: `T${++trackN}`, cargoId, phone, adminPrice: price, status, userId },
  })
  if (updatedAt !== NOW || status === 'PICKED_UP') await sql(`UPDATE "Shipment" SET "updatedAt" = $1 WHERE id = $2`, [updatedAt, s.id])
  return s
}

async function user(cargoId: number, phone: string, verified: boolean, role: 'USER' | 'ADMIN' = 'USER') {
  return prisma.user.create({ data: { name: `U${phone}`, phone, password: 'x', role, cargoId, phoneVerifiedAt: verified ? ago(5) : null } })
}

async function enable(cargoId: number, patch: Record<string, unknown>) {
  const { configFromRow, validateConfigInput } = await import('./loyalty-core')
  const v = validateConfigInput(patch, configFromRow(null))
  if ('error' in v) throw new Error(v.error)
  await L.saveLoyaltyConfig(prisma, cargoId, v.value, S.adminA)
}

describe('loyalty on a real local Postgres', { skip }, () => {
  let preExisting: number

  before(async () => {
    const admin = new Client({ connectionString: `${PG!.replace(/\/$/, '')}/postgres` })
    await admin.connect()
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`)
    await admin.query(`CREATE DATABASE ${DB}`)
    await admin.end()
    const dir = mkdtempSync(join(tmpdir(), 'loyalty-'))
    writeFileSync(join(dir, 'base.prisma'), baseSchema())
    const baseSql = prismaCli(['migrate', 'diff', '--from-empty', '--to-schema', join(dir, 'base.prisma'), '--script'])
    const c = new Client({ connectionString: URL })
    await c.connect()
    await c.query(baseSql)
    // Одоо байгаа өгөгдөл (migration-д хөндөгдөх ёсгүй)
    await c.query(`INSERT INTO "Cargo" (name, slug, "ereemReceiver", "ereemPhone", "ereemAddress") VALUES ('Old', 'old', 'r', 'p', 'a')`)
    await c.query(`INSERT INTO "Shipment" ("trackCode", status, "cargoId", phone, "adminPrice", "updatedAt") SELECT 'OLD' || g, 'PICKED_UP', 1, '99000000', 1000, now() FROM generate_series(1, 50) g`)
    await c.end()
    preExisting = 50

    process.env.DATABASE_URL = URL
    ;({ prisma } = await import('./prisma'))
    for (const s of LOYALTY_DDL) await prisma.$executeRawUnsafe(s)
    L = await import('./loyalty')

    const a = await prisma.cargo.create({ data: { name: 'A', slug: 'a', ereemReceiver: 'r', ereemPhone: 'p', ereemAddress: 'x' } })
    const b = await prisma.cargo.create({ data: { name: 'B', slug: 'b', ereemReceiver: 'r', ereemPhone: 'p', ereemAddress: 'x' } })
    const ua = await user(a.id, '80000001', true, 'ADMIN')
    const ub = await user(b.id, '80000002', true, 'ADMIN')
    S = { cargoA: a.id, cargoB: b.id, adminA: { id: ua.id, name: ua.name, phone: ua.phone }, adminB: { id: ub.id, name: ub.name, phone: ub.phone } }
  })

  after(async () => {
    await prisma?.$disconnect()
    if (!PG) return
    const admin = new Client({ connectionString: `${PG.replace(/\/$/, '')}/postgres` })
    await admin.connect()
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`)
    await admin.end()
  })

  describe('migration', () => {
    it('is additive, idempotent and matches schema.prisma exactly', async () => {
      for (const s of LOYALTY_DDL) await prisma.$executeRawUnsafe(s) // second run
      const diff = prismaCli(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--script'], { DATABASE_URL: URL, DIRECT_URL: URL })
      assert.match(diff, /empty migration/i)
      const rows = await sql(`SELECT count(*)::int n, count("receiptId")::int linked FROM "Shipment" WHERE "trackCode" LIKE 'OLD%'`)
      assert.deepEqual(rows[0], { n: preExisting, linked: 0 })
    })

    it('enables RLS on every new table', async () => {
      const rows = await sql(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('LoyaltySettings','LoyaltyAccount','LoyaltyLedger','HandoverReceipt','ShipmentPriceChange') ORDER BY relname`)
      assert.equal(rows.length, 5)
      assert.ok(rows.every(r => r.relrowsecurity === true))
    })

    it('DB rejects invalid values (CHECK constraints)', async () => {
      await assert.rejects(sql(`INSERT INTO "LoyaltySettings" ("cargoId", "maxRedeemPct", "vipTiers", "updatedAt") VALUES (1, 101, '[]', now())`))
      await assert.rejects(sql(`INSERT INTO "LoyaltyAccount" ("cargoId", phone, "vipManualPct", "updatedAt") VALUES (1, '1', 6, now())`))
    })
  })

  describe('defaults OFF (current behaviour)', () => {
    it('handover marks PICKED_UP and writes a plain receipt, no loyalty rows', async () => {
      const s1 = await shipment(S.cargoA, '99110001', 12000)
      const s2 = await shipment(S.cargoA, '99110001', 3000)
      const r = await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s1.id, s2.id], requestKey: key(), now: NOW })
      assert.equal(r.count, 2)
      assert.equal(r.receipts.length, 1)
      assert.deepEqual([r.receipts[0].grossMnt, r.receipts[0].vipDiscountMnt, r.receipts[0].pointsEarned, r.receipts[0].netMnt], [15000, 0, 0, 15000])
      const rows = await prisma.shipment.findMany({ where: { id: { in: [s1.id, s2.id] } } })
      assert.ok(rows.every(x => x.status === 'PICKED_UP' && x.receiptId === r.receipts[0].id))
      assert.equal(await prisma.loyaltyAccount.count({ where: { cargoId: S.cargoA } }), 0)
      assert.equal(await prisma.loyaltyLedger.count(), 0)
    })
  })

  describe('idempotency', () => {
    it('same requestKey twice → one receipt, one ledger set', async () => {
      await enable(S.cargoA, { pointsEnabled: true, vipEnabled: true })
      const s = await shipment(S.cargoA, '99110002', 10000)
      const k = key()
      const a = await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s.id], requestKey: k, now: NOW })
      const b = await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s.id], requestKey: k, now: NOW })
      assert.equal(b.replayed, true)
      assert.deepEqual(b.receipts.map(x => x.id), a.receipts.map(x => x.id))
      assert.equal(await prisma.handoverReceipt.count({ where: { requestKey: k } }), 1)
      assert.equal(await prisma.loyaltyLedger.count({ where: { receiptId: a.receipts[0].id } }), 1)
    })

    it('concurrent requests (same or different key) on the same shipments create exactly one receipt', async () => {
      const s = await shipment(S.cargoA, '99110003', 20000)
      const k = key()
      const res = await Promise.all([
        L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s.id], requestKey: k, now: NOW }),
        L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s.id], requestKey: k, now: NOW }),
        L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s.id], requestKey: key(), now: NOW }),
      ])
      const ids = new Set(res.flatMap(r => r.receipts.map(x => x.id)))
      assert.equal(ids.size, 1)
      assert.equal(await prisma.handoverReceipt.count({ where: { phone: '99110003' } }), 1)
      assert.equal(await prisma.loyaltyLedger.count({ where: { receiptId: [...ids][0] } }), 1)
      assert.equal(res.reduce((n, r) => n + (r.replayed ? 0 : r.count), 0), 1)
    })
  })

  describe('VIP discount', () => {
    it('auto tier from 90-day spend; older handovers outside the window ignored', async () => {
      const p = '99120001'
      await shipment(S.cargoA, p, 150000, 'PICKED_UP', ago(20))
      await shipment(S.cargoA, p, 60000, 'PICKED_UP', ago(40))
      await shipment(S.cargoA, p, 900000, 'PICKED_UP', ago(200))
      const s = await shipment(S.cargoA, p, 10000)
      const r = await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s.id], requestKey: key(), now: NOW })
      assert.equal(r.receipts[0].vipPct, 2) // 210k → 2%
      assert.equal(r.receipts[0].vipDiscountMnt, 200)
      assert.equal(r.receipts[0].netMnt, 9800)
      assert.equal(r.receipts[0].pointsEarned, 9)
    })

    it('manual VIP applies when higher; expired manual ignored', async () => {
      const p = '99120002'
      await L.setManualVip(prisma, S.cargoA, p, { pct: 5, note: 'том харилцагч', until: null }, S.adminA, NOW)
      const s = await shipment(S.cargoA, p, 10000)
      const r = await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s.id], requestKey: key(), now: NOW })
      assert.equal(r.receipts[0].vipPct, 5)
      await L.setManualVip(prisma, S.cargoA, p, { pct: 3, note: null, until: ago(1) }, S.adminA, NOW)
      const s2 = await shipment(S.cargoA, p, 10000)
      const r2 = await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s2.id], requestKey: key(), now: NOW })
      assert.equal(r2.receipts[0].vipPct, 0)
    })
  })

  describe('points', () => {
    it('accrues without registration, redeem needs registered + verified phone', async () => {
      const p = '99130001'
      const s1 = await shipment(S.cargoA, p, 50000)
      await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s1.id], requestKey: key(), now: ago(10) })
      const s2 = await shipment(S.cargoA, p, 10000)
      await assert.rejects(
        L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s2.id], requestKey: key(), redeem: { [p]: 10 }, now: NOW }),
        /баталгаажуулсан/,
      )
      // rolled back: still ARRIVED, no receipt
      assert.equal((await prisma.shipment.findUnique({ where: { id: s2.id } }))!.status, 'ARRIVED')
      assert.equal(await prisma.handoverReceipt.count({ where: { shipments: { some: { id: s2.id } } } }), 0)
      const u = await user(S.cargoA, p, false)
      await assert.rejects(L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s2.id], requestKey: key(), redeem: { [p]: 10 }, now: NOW }))
      await prisma.user.update({ where: { id: u.id }, data: { phoneVerifiedAt: NOW } })
      const q = await L.quoteHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s2.id], now: NOW })
      assert.equal(q.groups[0].customer!.pointsBalance, 50)
      assert.equal(q.groups[0].quote.maxRedeemPoints, 50) // 50 pts × 20₮ = 1000 ≤ 50% of 10000
      const r = await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s2.id], requestKey: key(), redeem: { [p]: 50 }, expectedNet: { [p]: 9000 }, now: NOW })
      assert.deepEqual([r.receipts[0].pointsRedeemed, r.receipts[0].pointsRedeemedMnt, r.receipts[0].netMnt, r.receipts[0].pointsEarned], [50, 1000, 9000, 9])
      const st = (await L.loadCustomerStates(prisma, S.cargoA, await L.getLoyaltyConfig(prisma, S.cargoA), [p], NOW)).get(p)!
      assert.equal(st.points.balance, 9)
    })

    it('max 50% of a handover and no more than the balance', async () => {
      const p = '99130002'
      await user(S.cargoA, p, true)
      const big = await shipment(S.cargoA, p, 1_000_000)
      await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [big.id], requestKey: key(), now: ago(1) })
      const s = await shipment(S.cargoA, p, 4000)
      await assert.rejects(
        L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s.id], requestKey: key(), redeem: { [p]: 101 }, now: NOW }),
        /95 оноо/, // VIP 5% first (1M spend yesterday) → 3800₮ × 50% = 1900₮ = 95 points, balance 1000
      )
      const r = await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s.id], requestKey: key(), redeem: { [p]: 95 }, now: NOW })
      assert.deepEqual([r.receipts[0].vipPct, r.receipts[0].vipDiscountMnt, r.receipts[0].pointsRedeemedMnt, r.receipts[0].netMnt], [5, 200, 1900, 1900])
    })

    it('expires 180 days after earning and writes the EXPIRE row on next handover', async () => {
      const p = '99130003'
      await user(S.cargoA, p, true)
      const s1 = await shipment(S.cargoA, p, 30000)
      await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s1.id], requestKey: key(), now: ago(200) })
      const s2 = await shipment(S.cargoA, p, 5000)
      await assert.rejects(L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s2.id], requestKey: key(), redeem: { [p]: 1 }, now: NOW }), /алга/)
      await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s2.id], requestKey: key(), now: NOW })
      const acc = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { cargoId_phone: { cargoId: S.cargoA, phone: p } }, include: { ledger: true } })
      assert.deepEqual(acc.ledger.map(e => [e.kind, e.points]).sort(), [['EARN', 30], ['EARN', 5], ['EXPIRE', -30]].sort())
      assert.equal(acc.ledger.reduce((a, e) => a + e.points, 0), 5)
    })

    it('ledger is append-only at the DB level', async () => {
      const [row] = await sql(`SELECT id FROM "LoyaltyLedger" LIMIT 1`)
      await assert.rejects(sql(`UPDATE "LoyaltyLedger" SET points = 999 WHERE id = $1`, [row.id]), /append-only/)
      await assert.rejects(sql(`DELETE FROM "LoyaltyLedger" WHERE id = $1`, [row.id]), /append-only/)
      await assert.rejects(prisma.loyaltyLedger.update({ where: { id: row.id }, data: { note: 'x' } }))
    })
  })

  describe('price edits after handover', () => {
    it('log every change and add compensating ADJUST rows (never edit old rows)', async () => {
      const p = '99140001'
      const s = await shipment(S.cargoA, p, 10000)
      const s2 = await shipment(S.cargoA, p, 10000)
      const r = await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s.id, s2.id], requestKey: key(), now: NOW })
      assert.equal(r.receipts[0].pointsEarned, 20)
      const edit = async (id: number, price: number) => prisma.$transaction(async tx => {
        const [cur] = await tx.$queryRaw<{ id: number; trackCode: string; status: string; adminPrice: number; receiptId: number | null }[]>`SELECT id, "trackCode", status::text, "adminPrice", "receiptId" FROM "Shipment" WHERE id = ${id} FOR UPDATE`
        await tx.shipment.update({ where: { id }, data: { adminPrice: price } })
        return L.recordPriceChange(tx, { cargoId: S.cargoA, actor: S.adminA, shipment: cur, newPrice: price, now: NOW })
      })
      const c1 = await edit(s.id, 25000) // gross 20k → 35k
      assert.equal(c1!.pointsDelta, 15)
      const c2 = await edit(s2.id, 1000) // 35k → 26k
      assert.equal(c2!.pointsDelta, -9)
      assert.equal(await edit(s2.id, 1000), null) // unchanged → nothing logged
      const led = await prisma.loyaltyLedger.findMany({ where: { receiptId: r.receipts[0].id }, orderBy: { id: 'asc' } })
      assert.deepEqual(led.map(e => [e.kind, e.points]), [['EARN', 20], ['ADJUST', 15], ['ADJUST', -9]])
      const receipt = await prisma.handoverReceipt.findUniqueOrThrow({ where: { id: r.receipts[0].id } })
      assert.equal(Number(receipt.grossMnt), 20000) // snapshot unchanged
      assert.equal(await prisma.shipmentPriceChange.count({ where: { receiptId: receipt.id } }), 2)
    })

    it('price changes before handover are logged without ledger rows', async () => {
      const s = await shipment(S.cargoA, '99140002', 5000)
      const res = await prisma.$transaction(tx => L.recordPriceChange(tx, { cargoId: S.cargoA, actor: S.adminA, shipment: { ...s, status: 'ARRIVED' }, newPrice: 6000, now: NOW }))
      assert.equal(res!.pointsDelta, 0)
      assert.equal(await prisma.shipmentPriceChange.count({ where: { shipmentId: s.id } }), 1)
    })
  })

  describe('grouping and self-handover', () => {
    it('one request with two owners → two receipts; admin own phone gets no loyalty', async () => {
      const a = await shipment(S.cargoA, '99150001', 10000)
      const b = await shipment(S.cargoA, S.adminA.phone, 10000)
      const c = await shipment(S.cargoA, null, 7000)
      const r = await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [a.id, b.id, c.id], requestKey: key(), now: NOW })
      assert.equal(r.receipts.length, 3)
      const self = r.receipts.find(x => x.phone === S.adminA.phone)!
      assert.deepEqual([self.pointsEarned, self.loyaltyNote], [0, 'self'])
      const none = r.receipts.find(x => x.phone === null)!
      assert.equal(none.pointsEarned, 0)
      assert.equal(r.receipts.find(x => x.phone === '99150001')!.pointsEarned, 10)
    })

    it('stale expectedNet → 409 and nothing written', async () => {
      const s = await shipment(S.cargoA, '99150002', 10000)
      await assert.rejects(
        L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s.id], requestKey: key(), expectedNet: { '99150002': 12345 }, now: NOW }),
        (e: unknown) => e instanceof L.LoyaltyError && e.status === 409,
      )
      assert.equal((await prisma.shipment.findUnique({ where: { id: s.id } }))!.status, 'ARRIVED')
    })
  })

  describe('tenant isolation', () => {
    it('cargo B cannot hand over, quote or reprice cargo A shipments', async () => {
      const s = await shipment(S.cargoA, '99160001', 10000)
      const r = await L.performHandover(prisma, { cargoId: S.cargoB, actor: S.adminB, shipmentIds: [s.id], requestKey: key(), now: NOW })
      assert.equal(r.count, 0)
      assert.equal((await prisma.shipment.findUnique({ where: { id: s.id } }))!.status, 'ARRIVED')
      const q = await L.quoteHandover(prisma, { cargoId: S.cargoB, actor: S.adminB, shipmentIds: [s.id], now: NOW })
      assert.equal(q.groups.length, 0)
      const ra = await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [s.id], requestKey: key(), now: NOW })
      await assert.rejects(
        prisma.$transaction(tx => L.recordPriceChange(tx, { cargoId: S.cargoB, actor: S.adminB, shipment: { ...s, status: 'PICKED_UP', receiptId: ra.receipts[0].id }, newPrice: 90000, now: NOW })),
        /олдсонгүй/,
      )
      assert.equal(await prisma.shipmentPriceChange.count({ where: { cargoId: S.cargoB } }), 0)
      assert.equal(await prisma.loyaltyLedger.count({ where: { cargoId: S.cargoB } }), 0)
    })

    it('same phone in two cargos → separate accounts, balances, VIP and reports', async () => {
      const p = '99160002'
      await enable(S.cargoB, { pointsEnabled: true, vipEnabled: true })
      const a = await shipment(S.cargoA, p, 300000, 'PICKED_UP', ago(5))
      void a
      const sa = await shipment(S.cargoA, p, 40000)
      await L.performHandover(prisma, { cargoId: S.cargoA, actor: S.adminA, shipmentIds: [sa.id], requestKey: key(), now: NOW })
      const sb = await shipment(S.cargoB, p, 10000)
      const rb = await L.performHandover(prisma, { cargoId: S.cargoB, actor: S.adminB, shipmentIds: [sb.id], requestKey: key(), now: NOW })
      assert.equal(rb.receipts[0].vipPct, 0) // A's spend does not count in B
      assert.equal(rb.receipts[0].pointsEarned, 10)
      const cfgB = await L.getLoyaltyConfig(prisma, S.cargoB)
      const stB = (await L.loadCustomerStates(prisma, S.cargoB, cfgB, [p], NOW)).get(p)!
      assert.equal(stB.points.balance, 10)
      const listB = await L.listLoyaltyCustomers(prisma, S.cargoB, cfgB, NOW)
      assert.ok(listB.every(r => r.phone === p ? r.pointsBalance === 10 : true))
      assert.ok(!listB.some(r => r.phone === '99120001')) // A-only VIP customer never listed in B
      const listA = await L.listLoyaltyCustomers(prisma, S.cargoA, await L.getLoyaltyConfig(prisma, S.cargoA), NOW)
      assert.equal(listA.find(r => r.phone === p)!.effectivePct, 3)
      const custB = await L.customerLoyalty(prisma, S.cargoB, p, NOW)
      assert.equal(custB!.receipts.length, 1)
      const repB = await L.monthlyReport(prisma, S.cargoB, '2026-11', NOW)
      assert.equal(repB.receipts.count, 1)
      assert.equal(repB.outstandingPoints, 10)
      // B setting change does not affect A
      await enable(S.cargoB, { pointsEnabled: false })
      assert.equal((await L.getLoyaltyConfig(prisma, S.cargoA)).pointsEnabled, true)
    })
  })

  describe('report', () => {
    it('monthly report sums receipts and ledger for the cargo', async () => {
      const rep = await L.monthlyReport(prisma, S.cargoA, '2026-11', NOW)
      const rc = await prisma.handoverReceipt.aggregate({ where: { cargoId: S.cargoA, createdAt: { gte: new Date('2026-10-31T16:00:00Z') } }, _sum: { vipDiscountMnt: true }, _count: { _all: true } })
      assert.equal(rep.receipts.count, rc._count._all)
      assert.equal(rep.receipts.vipDiscountMnt, Number(rc._sum.vipDiscountMnt))
      assert.ok(rep.ledger.earned > 0 && rep.ledger.redeemed === 145 && rep.ledger.expired === 30)
      assert.equal(rep.priceEditsAfterHandover.count, 2)
      assert.equal(rep.priceEditsAfterHandover.pointsDelta, 6)
    })
  })

  describe('history revert (PICKED_UP → ARRIVED)', () => {
    let C: number, D: number
    const balance = async (cargoId: number, phone: string, at = NOW) =>
      (await L.loadCustomerStates(prisma, cargoId, await L.getLoyaltyConfig(prisma, cargoId), [phone], at)).get(phone)!
    const ho = (cargoId: number, ids: number[], extra: Record<string, unknown> = {}) =>
      L.performHandover(prisma, { cargoId, actor: S.adminA, shipmentIds: ids, requestKey: key(), now: NOW, ...extra })
    const revert = (cargoId: number, shipmentId: number, wholeReceipt = false, actor = S.adminA) =>
      L.revertHandover(prisma, { cargoId, actor, shipmentId, wholeReceipt, now: NOW })

    before(async () => {
      C = (await prisma.cargo.create({ data: { name: 'C', slug: 'c-revert', ereemReceiver: 'r', ereemPhone: 'p', ereemAddress: 'x' } })).id
      D = (await prisma.cargo.create({ data: { name: 'D', slug: 'd-revert', ereemReceiver: 'r', ereemPhone: 'p', ereemAddress: 'x' } })).id
      await enable(C, { pointsEnabled: true, vipEnabled: true })
    })

    it('voids the receipt, reverses earned + refunds redeemed points, detaches; re-handover earns once', async () => {
      const p = '99180001'
      await user(C, p, true)
      const hist = await shipment(C, p, 700000)
      await L.performHandover(prisma, { cargoId: C, actor: S.adminA, shipmentIds: [hist.id], requestKey: key(), now: ago(175) }) // 700 pts, expire in 5 days
      const before0 = await balance(C, p)
      assert.equal(before0.points.balance, 700)
      const s = await shipment(C, p, 20000)
      const r1 = await ho(C, [s.id], { redeem: { [p]: 490 } })
      assert.deepEqual([r1.receipts[0].pointsRedeemed, r1.receipts[0].netMnt, r1.receipts[0].pointsEarned], [490, 10200, 10]) // no VIP (old spend outside window)
      assert.equal((await balance(C, p)).points.balance, 700 - 490 + 10)

      const rv = await revert(C, s.id)
      assert.deepEqual([rv.receiptId, rv.pointsReversed, rv.pointsRefunded, rv.shipmentIds], [r1.receipts[0].id, 10, 490, [s.id]])
      const after = await balance(C, p)
      assert.equal(after.points.balance, before0.points.balance)
      assert.deepEqual(after.points.expiringSoon, before0.points.expiringSoon) // refunded points keep their original expiry
      const sh = await prisma.shipment.findUniqueOrThrow({ where: { id: s.id } })
      assert.deepEqual([sh.status, sh.receiptId], ['ARRIVED', null])
      const rc = await prisma.handoverReceipt.findUniqueOrThrow({ where: { id: r1.receipts[0].id } })
      assert.ok(rc.voidedAt && rc.voidedById === S.adminA.id)
      // append-only: original EARN/REDEEM untouched, compensating VOID rows added
      const rows = await prisma.loyaltyLedger.findMany({ where: { receiptId: rc.id }, orderBy: { id: 'asc' } })
      assert.deepEqual(rows.map(r => [r.kind, r.points]), [['REDEEM', -490], ['EARN', 10], ['VOID', 490], ['VOID', -10]])

      // second revert of the same (now ARRIVED) shipment is refused, nothing new written
      await assert.rejects(revert(C, s.id), /буцаах боломжгүй/)
      assert.equal(await prisma.loyaltyLedger.count({ where: { receiptId: rc.id } }), 4)

      // fresh handover → new receipt, earns exactly once
      const r2 = await ho(C, [s.id])
      assert.notEqual(r2.receipts[0].id, rc.id)
      assert.equal((await balance(C, p)).points.balance, 700 + r2.receipts[0].pointsEarned)
      assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: s.id } })).receiptId, r2.receipts[0].id)
    })

    it('concurrent double revert reverses only once', async () => {
      const p = '99180002'
      await user(C, p, true)
      const s = await shipment(C, p, 50000)
      const r = await ho(C, [s.id])
      const res = await Promise.allSettled([revert(C, s.id), revert(C, s.id)])
      assert.equal(res.filter(x => x.status === 'fulfilled').length, 1)
      assert.equal(await prisma.loyaltyLedger.count({ where: { receiptId: r.receipts[0].id, kind: 'VOID' } }), 1)
      assert.equal((await balance(C, p)).points.balance, 0)
    })

    it('multi-shipment receipt: single revert blocked (409), wholeReceipt reverts all', async () => {
      const p = '99180003'
      const a = await shipment(C, p, 10000), b = await shipment(C, p, 20000)
      const r = await ho(C, [a.id, b.id])
      await assert.rejects(revert(C, a.id), (e: unknown) => {
        const err = e as InstanceType<typeof L.LoyaltyError>
        assert.equal(err.status, 409)
        assert.match(err.message, /нэг баримтаар/)
        assert.equal((err.details as { code: string }).code, 'RECEIPT_MULTI')
        return true
      })
      assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: a.id } })).status, 'PICKED_UP')
      assert.equal((await prisma.handoverReceipt.findUniqueOrThrow({ where: { id: r.receipts[0].id } })).voidedAt, null)
      const rv = await revert(C, a.id, true)
      assert.deepEqual(rv.shipmentIds.sort(), [a.id, b.id].sort())
      const rows = await prisma.shipment.findMany({ where: { id: { in: [a.id, b.id] } } })
      assert.ok(rows.every(x => x.status === 'ARRIVED' && x.receiptId === null))
      assert.equal((await balance(C, p)).points.balance, 0)
    })

    it('reverses ADJUST rows from a price edit too; VIP spend and report exclude the voided receipt', async () => {
      const p = '99180004'
      const s = await shipment(C, p, 100000)
      const r = await ho(C, [s.id])
      await prisma.$transaction(async tx => {
        const cur = await tx.shipment.findUniqueOrThrow({ where: { id: s.id } })
        await L.recordPriceChange(tx, { cargoId: C, actor: S.adminA, shipment: cur, newPrice: 200000, now: NOW })
        await tx.shipment.update({ where: { id: s.id }, data: { adminPrice: 200000 } })
      })
      const mid = await balance(C, p)
      assert.equal(mid.points.balance, 200) // 100 earned at 0% VIP + 100 ADJUST after the price doubled
      assert.equal(mid.auto.spend, 200000)
      const repBefore = await L.monthlyReport(prisma, C, '2026-11', NOW)
      const rv = await revert(C, s.id)
      assert.equal(rv.pointsReversed, mid.points.balance)
      const after = await balance(C, p)
      assert.equal(after.points.balance, 0)
      assert.equal(after.auto.spend, 0)
      const rep = await L.monthlyReport(prisma, C, '2026-11', NOW)
      assert.equal(rep.receipts.count, repBefore.receipts.count - 1)
      assert.equal(rep.receipts.grossMnt, repBefore.receipts.grossMnt - 100000)
      assert.equal(rep.voidedReceipts.count, repBefore.voidedReceipts.count + 1)
      assert.equal(rep.ledger.voidReversed, repBefore.ledger.voidReversed + mid.points.balance)
      // reverted receipt is netted out of earned points / price-edit adjustments too
      assert.equal(rep.ledger.earned, repBefore.ledger.earned - 100)
      assert.equal(rep.ledger.adjustedUp, repBefore.ledger.adjustedUp - 100)
      assert.equal(rep.priceEditsAfterHandover.count, repBefore.priceEditsAfterHandover.count - 1)
      assert.ok(!(await L.customerLoyalty(prisma, C, p, NOW))!.receipts.some(x => x.id === r.receipts[0].id))
    })

    it('monthly report nets a reverted handover out of earned/redeemed points; matches receipt totals', async () => {
      const p = '99180006'
      await user(C, p, true)
      const hist = await shipment(C, p, 300000)
      await L.performHandover(prisma, { cargoId: C, actor: S.adminA, shipmentIds: [hist.id], requestKey: key(), now: ago(40) }) // previous month
      const repBefore = await L.monthlyReport(prisma, C, '2026-11', NOW)
      const s = await shipment(C, p, 20000)
      const r = await ho(C, [s.id], { redeem: { [p]: 100 } })
      const mid = await L.monthlyReport(prisma, C, '2026-11', NOW)
      assert.equal(mid.ledger.earned - repBefore.ledger.earned, r.receipts[0].pointsEarned)
      assert.equal(mid.ledger.redeemed - repBefore.ledger.redeemed, 100)
      assert.equal(mid.receipts.pointsRedeemed - repBefore.receipts.pointsRedeemed, 100)
      await revert(C, s.id)
      const rep = await L.monthlyReport(prisma, C, '2026-11', NOW)
      assert.deepEqual(
        [rep.ledger.earned, rep.ledger.redeemed, rep.receipts.pointsEarned, rep.receipts.pointsRedeemed, rep.receipts.netMnt, rep.receipts.vipDiscountMnt],
        [repBefore.ledger.earned, repBefore.ledger.redeemed, repBefore.receipts.pointsEarned, repBefore.receipts.pointsRedeemed, repBefore.receipts.netMnt, repBefore.receipts.vipDiscountMnt],
      )
      // info section still shows what was reverted
      assert.equal(rep.ledger.voidRefunded - repBefore.ledger.voidRefunded, 100)
      assert.equal(rep.ledger.voidReversed - repBefore.ledger.voidReversed, r.receipts[0].pointsEarned)
      assert.equal(rep.voidedReceipts.count - repBefore.voidedReceipts.count, 1)
    })

    it('paidByShipment splits a receipt net across its shipments, skips voided; pointsBalances after handover', async () => {
      const p = '99180007'
      const a = await shipment(C, p, 10000)
      const b = await shipment(C, p, 20000)
      const rc = (await ho(C, [a.id, b.id])).receipts[0]
      const paid = await L.paidByShipment(prisma, C, [rc.id, null, rc.id])
      assert.equal(paid[a.id].paidMnt + paid[b.id].paidMnt, rc.netMnt)
      assert.deepEqual([paid[a.id].receiptId, paid[b.id].itemCount], [rc.id, 2])
      assert.equal((await L.pointsBalances(prisma, C, [p, null]))![p], rc.pointsEarned)
      assert.equal(await L.pointsBalances(prisma, D, [p]), null) // points off
      await revert(C, a.id, true)
      assert.deepEqual(await L.paidByShipment(prisma, C, [rc.id]), {})
      assert.equal((await L.pointsBalances(prisma, C, [p]))![p], 0)
    })

    it('loyalty OFF: receipt voided, no ledger rows; legacy shipment without receipt reverts as before', async () => {
      const s = await shipment(D, '99180005', 15000)
      const r = await ho(D, [s.id])
      const rv = await revert(D, s.id)
      assert.deepEqual([rv.receiptId, rv.pointsReversed, rv.pointsRefunded], [r.receipts[0].id, 0, 0])
      assert.equal(await prisma.loyaltyLedger.count({ where: { cargoId: D } }), 0)
      const legacy = await shipment(D, '99180005', 5000, 'PICKED_UP', ago(3))
      const lv = await revert(D, legacy.id)
      assert.deepEqual([lv.receiptId, (await prisma.shipment.findUniqueOrThrow({ where: { id: legacy.id } })).status], [null, 'ARRIVED'])
    })

    it('tenant isolation: another cargo cannot revert, nothing changes', async () => {
      const s = await shipment(C, '99180006', 10000)
      const r = await ho(C, [s.id])
      await assert.rejects(revert(D, s.id, true, S.adminB), /Олдсонгүй/)
      assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: s.id } })).status, 'PICKED_UP')
      assert.equal((await prisma.handoverReceipt.findUniqueOrThrow({ where: { id: r.receipts[0].id } })).voidedAt, null)
    })

    it('migration upgrades the v1 kind CHECK to v2 (VOID allowed) idempotently', async () => {
      await sql(`ALTER TABLE "LoyaltyLedger" DROP CONSTRAINT IF EXISTS "LoyaltyLedger_kind_v2_check"`)
      await sql(`ALTER TABLE "LoyaltyLedger" ADD CONSTRAINT "LoyaltyLedger_kind_check" CHECK (("kind" = 'EARN' AND "points" > 0) OR ("kind" = 'REDEEM' AND "points" < 0) OR ("kind" = 'EXPIRE' AND "points" < 0) OR ("kind" = 'ADJUST' AND "points" <> 0)) NOT VALID`)
      for (const st of LOYALTY_DDL) await prisma.$executeRawUnsafe(st)
      for (const st of LOYALTY_DDL) await prisma.$executeRawUnsafe(st)
      const cons = await sql(`SELECT conname FROM pg_constraint WHERE conname LIKE 'LoyaltyLedger_kind%' AND contype = 'c' ORDER BY 1`)
      assert.deepEqual(cons.map(c => c.conname), ['LoyaltyLedger_kind_v2_check'])
      const [acc] = await sql(`SELECT id, "cargoId" FROM "LoyaltyAccount" LIMIT 1`)
      await assert.rejects(sql(`INSERT INTO "LoyaltyLedger" ("cargoId","accountId",kind,points,"dedupeKey") VALUES ($1,$2,'VOID',0,'t-void-0')`, [acc.cargoId, acc.id]))
      await assert.rejects(sql(`INSERT INTO "LoyaltyLedger" ("cargoId","accountId",kind,points,"dedupeKey") VALUES ($1,$2,'BOGUS',1,'t-bogus')`, [acc.cargoId, acc.id]))
      await assert.rejects(sql(`UPDATE "HandoverReceipt" SET "voidedAt" = now(), "voidedById" = NULL WHERE id = (SELECT min(id) FROM "HandoverReceipt")`))
    })
  })

  describe('cleanup paths', () => {
    it('demo purge and cargo deletion work despite the append-only trigger', async () => {
      const c = await prisma.cargo.create({ data: { name: 'D', slug: 'd', ereemReceiver: 'r', ereemPhone: 'p', ereemAddress: 'x' } })
      await enable(c.id, { pointsEnabled: true })
      const s = await shipment(c.id, '99170001', 10000)
      await L.performHandover(prisma, { cargoId: c.id, actor: S.adminA, shipmentIds: [s.id], requestKey: key(), now: NOW })
      assert.equal(await prisma.loyaltyLedger.count({ where: { cargoId: c.id } }), 1)
      await L.purgeLoyaltyForDemo(prisma, c.id)
      assert.equal(await prisma.loyaltyLedger.count({ where: { cargoId: c.id } }), 0)
      assert.equal(await prisma.handoverReceipt.count({ where: { cargoId: c.id } }), 0)
      // purge flag is transaction-local: a later plain DELETE still fails
      const [row] = await sql(`SELECT id FROM "LoyaltyLedger" LIMIT 1`)
      await assert.rejects(sql(`DELETE FROM "LoyaltyLedger" WHERE id = $1`, [row.id]), /append-only/)

      const s2 = await shipment(c.id, '99170001', 10000)
      await enable(c.id, { pointsEnabled: true })
      await L.performHandover(prisma, { cargoId: c.id, actor: S.adminA, shipmentIds: [s2.id], requestKey: key(), now: NOW })
      await prisma.shipment.deleteMany({ where: { cargoId: c.id } })
      await prisma.cargo.delete({ where: { id: c.id } })
      assert.equal(await prisma.loyaltyLedger.count({ where: { cargoId: c.id } }), 0)
    })
  })
})

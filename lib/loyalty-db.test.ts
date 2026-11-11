// Локал Postgres дээрх урамшууллын интеграц тест. Өөр DB рүү хэзээ ч холбогдохгүй.
//   LOYALTY_TEST_DATABASE_URL=postgresql://aicargo:aicargo@localhost:5432/aicargo_test npx tsx --test lib/loyalty-db.test.ts
// Хувьсагч байхгүй, эсвэл host нь localhost биш бол тестийг алгасна (CI дээр Postgres байхгүй).
import test from 'node:test'
import assert from 'node:assert/strict'
import type { PrismaClient } from '@prisma/client'
import { addDays } from './loyalty'
import { LoyaltyError } from './loyalty-db'

function isLocalDatabaseUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^\[|\]$/g, '')
    return (u.protocol === 'postgres:' || u.protocol === 'postgresql:') && (host === 'localhost' || host === '127.0.0.1' || host === '::1')
  } catch {
    return false
  }
}

test('a non-localhost database URL is refused', () => {
  assert.equal(isLocalDatabaseUrl('postgresql://u:p@db.example.com:5432/aicargo'), false)
  assert.equal(isLocalDatabaseUrl('postgresql://u:p@192.168.1.4:5432/aicargo'), false)
  assert.equal(isLocalDatabaseUrl('mysql://localhost/aicargo'), false)
  assert.equal(isLocalDatabaseUrl('postgresql://aicargo:aicargo@localhost:5432/aicargo_test'), true)
  assert.equal(isLocalDatabaseUrl('postgresql://aicargo:aicargo@127.0.0.1:5432/aicargo_test'), true)
})

const rawUrl = process.env.LOYALTY_TEST_DATABASE_URL ?? ''
const enabled = isLocalDatabaseUrl(rawUrl)

test('loyalty on a real local Postgres', { skip: enabled ? false : 'LOYALTY_TEST_DATABASE_URL is not a localhost postgres URL' }, async () => {
  process.env.DATABASE_URL = rawUrl
  process.env.DIRECT_URL = rawUrl
  const { prisma } = await import('./prisma') as { prisma: PrismaClient }
  const db = await import('./loyalty-db')
  const created: number[] = []
  const seed = 71000000 + Math.floor(Math.random() * 800000)
  const ph = (n: number) => String(seed + n)
  let seq = 0

  async function cargo(tag: string) {
    const slug = `loy${seed}${tag}`
    const row = await prisma.cargo.create({
      data: { name: slug, slug, ereemReceiver: 't', ereemPhone: '99000000', ereemAddress: 't' },
    })
    created.push(row.id)
    return row.id
  }
  async function user(cargoId: number, phone: string, role: 'USER' | 'ADMIN', verified: boolean) {
    return prisma.user.create({
      data: { name: phone, phone, password: 'x', role, cargoId, phoneVerifiedAt: verified ? new Date() : null },
    })
  }
  async function ship(cargoId: number, phone: string | null, price: number, userId: number | null = null) {
    seq += 1
    return prisma.shipment.create({
      data: {
        cargoId, trackCode: `LY${seed}${seq}`, phone, adminPrice: price, status: 'ARRIVED', userId,
        arrivedAt: new Date(),
      },
    })
  }
  const actorOf = (u: { id: number; name: string; phone?: string | null }) => ({ id: u.id, name: u.name, phone: u.phone })

  try {
    const [hasCargo] = await prisma.$queryRaw<{ ok: string | null }[]>`SELECT to_regclass('public."Cargo"')::text AS ok`
    if (!hasCargo?.ok) throw new Error('Cargo table missing — push the Prisma schema to the local test database first')
    const [hasLedger] = await prisma.$queryRaw<{ ok: string | null }[]>`SELECT to_regclass('public."LoyaltyLedger"')::text AS ok`
    if (!hasLedger?.ok) {
      const { LOYALTY_DDL } = await import('../scripts/loyalty-ddl')
      for (const sql of LOYALTY_DDL) await prisma.$executeRawUnsafe(sql)
    }

    const A = await cargo('a')
    const B = await cargo('b')
    const adminA = await user(A, ph(1), 'ADMIN', true)
    const adminB = await user(B, ph(2), 'ADMIN', true)
    const actorA = actorOf(adminA)
    const cust = await user(A, ph(3), 'USER', true)       // баталгаажсан
    const unverified = await user(A, ph(4), 'USER', false)
    const staff = await user(A, ph(5), 'ADMIN', true)
    // User.phone нь бүх каргод давтагдахгүй. B дээр энэ утастай хэрэглэгч байхгүй ч
    // loyalty query cargoId-аар хязгаарлагдах ёстой.

    // ── Урамшуулал унтраалттай: баримт үүснэ, оноо үүсэхгүй, өмнөх үнэ хэвээр ──
    const off = await ship(A, ph(3), 5000, cust.id)
    const offRes = await db.performHandover(prisma, { cargoId: A, actor: actorA, shipmentIds: [off.id], requestKey: `off-${seed}` })
    assert.equal(offRes.replayed, false)
    assert.equal(offRes.receipts.length, 1)
    assert.equal(offRes.receipts[0].skipReason, 'OFF')
    assert.equal(offRes.receipts[0].netMnt, 5000)
    assert.equal(offRes.receipts[0].earnedPoints, 0)
    assert.equal(await prisma.loyaltyLedger.count({ where: { cargoId: A } }), 0)
    const offRow = await prisma.shipment.findUniqueOrThrow({ where: { id: off.id } })
    assert.equal(offRow.status, 'PICKED_UP')
    assert.equal(offRow.receiptId, offRes.receipts[0].id)

    // ── Карго хоорондын тусгаарлалт ──
    const foreign = await db.performHandover(prisma, { cargoId: B, actor: actorOf(adminB), shipmentIds: [off.id], requestKey: `foreign-${seed}` })
    assert.equal(foreign.count, 0)
    assert.equal(foreign.receipts.length, 0)
    const foreignQuote = await db.quoteHandover(prisma, B, [off.id], null)
    assert.equal(foreignQuote.count, 0)
    assert.equal(await prisma.handoverReceipt.count({ where: { cargoId: B } }), 0)
    assert.equal(await db.customerLoyalty(prisma, B, ph(3)), null)

    await db.saveSettings(prisma, A, actorA, { vipEnabled: true, pointsEnabled: true })
    assert.equal((await db.loadConfig(prisma, B)).exists, false)
    assert.equal((await db.loadConfig(prisma, A)).pointsEnabled, true)

    // ── Оноо олгох + ижил requestKey давтахад баримт, ledger дахин үүсэхгүй ──
    const earnShip = await ship(A, ph(3), 100000, cust.id)
    const key = `earn-${seed}`
    const earn = await db.performHandover(prisma, { cargoId: A, actor: actorA, shipmentIds: [earnShip.id], requestKey: key })
    assert.equal(earn.receipts.length, 1)
    assert.equal(earn.receipts[0].earnedPoints, 100)
    assert.equal(earn.receipts[0].discountMnt, 0)
    assert.equal(earn.receipts[0].netMnt, 100000)
    const ledgerBefore = await prisma.loyaltyLedger.findMany({ where: { cargoId: A, account: { phone: ph(3) } }, orderBy: { id: 'asc' } })
    assert.deepEqual(ledgerBefore.map(l => [l.kind, l.points]), [['EARN', 100]])
    const replay = await db.performHandover(prisma, { cargoId: A, actor: actorA, shipmentIds: [earnShip.id], requestKey: key })
    assert.equal(replay.replayed, true)
    assert.equal(replay.receipts[0].id, earn.receipts[0].id)
    const ledgerAfter = await prisma.loyaltyLedger.findMany({ where: { cargoId: A, account: { phone: ph(3) } }, orderBy: { id: 'asc' } })
    assert.deepEqual(ledgerAfter.map(l => [l.id, l.points]), ledgerBefore.map(l => [l.id, l.points]))
    // Өөр түлхүүрээр аль хэдийн олгосон ачааг дахин илгээхэд шинэ баримт гарахгүй
    const again = await db.performHandover(prisma, { cargoId: A, actor: actorA, shipmentIds: [earnShip.id], requestKey: `other-${seed}` })
    assert.equal(again.count, 0)
    assert.equal(await prisma.handoverReceipt.count({ where: { cargoId: A, requestKey: key } }), 1)

    // ── Зэрэг хоёр хүсэлт: нэг баримт, нэг ledger ──
    const raceShip = await ship(A, ph(3), 10000, cust.id)
    const raceKey = `race-${seed}`
    const [r1, r2] = await Promise.all([
      db.performHandover(prisma, { cargoId: A, actor: actorA, shipmentIds: [raceShip.id], requestKey: raceKey }),
      db.performHandover(prisma, { cargoId: A, actor: actorA, shipmentIds: [raceShip.id], requestKey: raceKey }),
    ])
    assert.equal([r1, r2].filter(r => r.receipts.length === 1).length, 2)
    assert.equal(await prisma.handoverReceipt.count({ where: { cargoId: A, requestKey: raceKey } }), 1)
    const raceReceiptId = (r1.receipts[0] ?? r2.receipts[0]).id
    assert.equal(await prisma.loyaltyLedger.count({ where: { cargoId: A, receiptId: raceReceiptId } }), 1)
    // B карго ижил түлхүүрээр A-ийн баримтыг уншихгүй
    assert.equal((await db.performHandover(prisma, { cargoId: B, actor: actorOf(adminB), shipmentIds: [raceShip.id], requestKey: raceKey })).count, 0)

    // ── Оноо зарцуулах: бүртгэлгүй, баталгаажаагүй хориглоно; 50% тааз; max ──
    const unregEarn = await ship(A, ph(6), 20000)
    await db.performHandover(prisma, { cargoId: A, actor: actorA, shipmentIds: [unregEarn.id], requestKey: `unreg-earn-${seed}` })
    const unregPay = await ship(A, ph(6), 2000)
    await assert.rejects(
      () => db.performHandover(prisma, { cargoId: A, actor: actorA, shipmentIds: [unregPay.id], requestKey: `unreg-pay-${seed}`, redeem: { phone: ph(6), points: 1 } }),
      (e: unknown) => e instanceof LoyaltyError && e.status === 409,
    )
    assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: unregPay.id } })).status, 'ARRIVED')

    const uvEarn = await ship(A, ph(4), 20000, unverified.id)
    await db.performHandover(prisma, { cargoId: A, actor: actorA, shipmentIds: [uvEarn.id], requestKey: `uv-earn-${seed}` })
    const uvPay = await ship(A, ph(4), 2000, unverified.id)
    await assert.rejects(
      () => db.performHandover(prisma, { cargoId: A, actor: actorA, shipmentIds: [uvPay.id], requestKey: `uv-pay-${seed}`, redeem: { phone: ph(4), points: 1 } }),
      (e: unknown) => e instanceof LoyaltyError && e.status === 409,
    )

    // Өмнөх олголтын дүн ₮90,000-аас давсан тул автомат VIP 1%. ₮2000 − ₮20, 50% = ₮990 = 49 оноо
    const over = await ship(A, ph(3), 2000, cust.id)
    await assert.rejects(
      () => db.performHandover(prisma, { cargoId: A, actor: actorA, shipmentIds: [over.id], requestKey: `over-${seed}`, redeem: { phone: ph(3), points: 51 } }),
      (e: unknown) => e instanceof LoyaltyError && e.status === 409,
    )
    assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: over.id } })).status, 'ARRIVED')
    const maxed = await db.performHandover(prisma, {
      cargoId: A, actor: actorA, shipmentIds: [over.id], requestKey: `max-${seed}`, redeem: { phone: ph(3), points: 'max' },
    })
    assert.equal(maxed.receipts[0].vipPct, 1)
    assert.equal(maxed.receipts[0].redeemedPoints, 49)
    assert.equal(maxed.receipts[0].redeemedMnt, 980)
    assert.equal(maxed.receipts[0].netMnt, 1000)
    assert.equal(maxed.receipts[0].earnedPoints, 1)
    const quoteNoWrite = await prisma.handoverReceipt.count({ where: { cargoId: A } })
    await db.quoteHandover(prisma, A, [(await ship(A, ph(3), 3000, cust.id)).id], { phone: ph(3), points: 'max' })
    assert.equal(await prisma.handoverReceipt.count({ where: { cargoId: A } }), quoteNoWrite)

    // ── Төлөх дүн өөрчлөгдсөн бол 409, ачаа хэвээр ──
    const stale = await ship(A, ph(3), 4000, cust.id)
    await prisma.shipment.update({ where: { id: stale.id }, data: { adminPrice: 5000 } })
    await assert.rejects(
      () => db.performHandover(prisma, { cargoId: A, actor: actorA, shipmentIds: [stale.id], requestKey: `stale-${seed}`, expectedNetMnt: 4000 }),
      (e: unknown) => e instanceof LoyaltyError && e.status === 409,
    )
    assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: stale.id } })).status, 'ARRIVED')

    // ── Ажилтны утас урамшуулалд орохгүй; гараар VIP зөвхөн энэ каргод ──
    const staffShip = await ship(A, ph(5), 8000, staff.id)
    const staffRes = await db.performHandover(prisma, { cargoId: A, actor: actorA, shipmentIds: [staffShip.id], requestKey: `staff-${seed}` })
    assert.equal(staffRes.receipts[0].skipReason, 'STAFF_PHONE')
    assert.equal(staffRes.receipts[0].earnedPoints, 0)
    await assert.rejects(
      () => db.setManualVip(prisma, A, actorA, { phone: ph(1), pct: 5, note: 'өөртөө', until: null }),
      (e: unknown) => e instanceof LoyaltyError && e.status === 403,
    )
    await assert.rejects(
      () => db.setManualVip(prisma, A, actorA, { phone: ph(5), pct: 5, note: 'ажилтан', until: null }),
      (e: unknown) => e instanceof LoyaltyError && e.status === 403,
    )
    await db.setManualVip(prisma, A, actorA, { phone: ph(3), pct: 5, note: 'туршилт', until: null })
    const vipA = await db.vipList(prisma, A)
    const vipB = await db.vipList(prisma, B)
    assert.equal(vipA.rows.find(r => r.phone === ph(3))?.pct, 5)
    assert.equal(vipA.rows.find(r => r.phone === ph(3))?.source, 'MANUAL')
    assert.equal(vipB.rows.find(r => r.phone === ph(3)), undefined)
    const vipShip = await ship(A, ph(3), 10000, cust.id)
    const vipRes = await db.performHandover(prisma, { cargoId: A, actor: actorA, shipmentIds: [vipShip.id], requestKey: `vip-${seed}` })
    assert.equal(vipRes.receipts[0].vipPct, 5)
    assert.equal(vipRes.receipts[0].vipSource, 'MANUAL')
    assert.equal(vipRes.receipts[0].discountMnt, 500)
    assert.equal(vipRes.receipts[0].netMnt, 9500)
    assert.equal(vipRes.receipts[0].earnedPoints, 9)
    // B дээр ижил утсаар харах үед A-ийн хөнгөлөлт, оноо алга
    const viewB = await db.customerLoyalty(prisma, B, ph(3))
    assert.equal(viewB, null)
    const viewA = await db.customerLoyalty(prisma, A, ph(3))
    assert.ok(viewA)
    assert.equal(viewA!.vip?.pct, 5)
    assert.equal(viewA!.vip?.source, 'MANUAL')
    assert.ok(viewA!.points!.balance > 0)
    const detailB = await db.adminCustomerDetail(prisma, B, ph(3))
    assert.equal(detailB.points.balance, 0)
    assert.equal(detailB.ledger.length, 0)

    // ── Олгосны дараа үнэ засах: ledger мөр хэвээр, зөрүү нь шинэ мөр ──
    const earnId = earn.receipts[0].id
    const earnLedgerId = ledgerBefore[0].id
    await prisma.$transaction(async tx => {
      const updated = await tx.shipment.update({ where: { id: earnShip.id }, data: { adminPrice: 110000 } })
      await db.recordPriceChange(tx, {
        cargoId: A, shipment: updated, oldPrice: 100000, newPrice: 110000, actor: actorA, source: 'test',
      })
    })
    assert.equal((await prisma.loyaltyLedger.findUniqueOrThrow({ where: { id: earnLedgerId } })).points, 100)
    const adjust = await prisma.loyaltyLedger.findFirstOrThrow({ where: { cargoId: A, receiptId: earnId, kind: 'ADJUST' } })
    assert.equal(adjust.points, 10)
    assert.equal(await prisma.shipmentPriceLog.count({ where: { cargoId: A, shipmentId: earnShip.id } }), 1)
    assert.equal(await prisma.shipmentPriceLog.count({ where: { cargoId: B } }), 0)

    // Оноогоор төлсөн баримтын дүн буурахад таазнаас хэтэрсэн оноо буцаж, REDEEM мөр хэвээр
    const redeemReceiptId = maxed.receipts[0].id
    const redeemRow = await prisma.loyaltyLedger.findFirstOrThrow({ where: { cargoId: A, receiptId: redeemReceiptId, kind: 'REDEEM' } })
    await prisma.$transaction(async tx => {
      const updated = await tx.shipment.update({ where: { id: over.id }, data: { adminPrice: 1000 } })
      await db.recordPriceChange(tx, {
        cargoId: A, shipment: updated, oldPrice: 2000, newPrice: 1000, actor: actorA, source: 'test',
      })
    })
    assert.equal((await prisma.loyaltyLedger.findUniqueOrThrow({ where: { id: redeemRow.id } })).points, -49)
    const refund = await prisma.loyaltyLedger.findFirstOrThrow({ where: { cargoId: A, receiptId: redeemReceiptId, kind: 'REDEEM_REFUND' } })
    assert.equal(refund.points, 25) // 49 → 24 (₮1000, VIP 1%, 50% тааз)

    // ── Олголт буцаах: залруулга бичигдэж, ачаа Ирсэн болно ──
    const reverted = await db.revertPickup(prisma, { cargoId: A, shipmentId: over.id, actor: actorA })
    assert.ok(reverted?.adjustment)
    const back = await prisma.shipment.findUniqueOrThrow({ where: { id: over.id } })
    assert.equal(back.status, 'ARRIVED')
    assert.equal(back.receiptId, null)
    assert.equal(await db.revertPickup(prisma, { cargoId: B, shipmentId: earnShip.id, actor: actorOf(adminB) }), null)
    assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: earnShip.id } })).status, 'PICKED_UP')

    // ── Ledger засах, устгах хориотой ──
    await assert.rejects(
      () => prisma.$executeRaw`UPDATE "LoyaltyLedger" SET points = 0 WHERE id = ${earnLedgerId}`,
      (e: unknown) => String(e instanceof Error ? e.message : e).includes('append-only'),
    )
    await assert.rejects(
      () => prisma.$executeRaw`DELETE FROM "LoyaltyLedger" WHERE id = ${earnLedgerId}`,
      (e: unknown) => String(e instanceof Error ? e.message : e).includes('append-only'),
    )
    assert.equal((await prisma.loyaltyLedger.findUniqueOrThrow({ where: { id: earnLedgerId } })).points, 100)

    // ── Автомат шат + 30 хоногийн grace, зөвхөн тухайн карго ──
    const tierShip = await ship(A, ph(7), 90000)
    await prisma.$executeRaw`UPDATE "Shipment" SET status = 'PICKED_UP', "updatedAt" = NOW() WHERE id = ${tierShip.id}`
    const tier1 = await db.refreshAutoTiers(prisma, A)
    assert.ok(tier1.changed >= 1)
    let tierAcc = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { cargoId_phone: { cargoId: A, phone: ph(7) } } })
    assert.equal(tierAcc.autoVipPct, 1)
    assert.equal(tierAcc.autoVipSpend, 90000)
    await prisma.$executeRaw`UPDATE "Shipment" SET "updatedAt" = NOW() - INTERVAL '100 days' WHERE id = ${tierShip.id}`
    await db.refreshAutoTiers(prisma, A)
    tierAcc = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { cargoId_phone: { cargoId: A, phone: ph(7) } } })
    assert.equal(tierAcc.autoVipPct, 1)
    assert.ok(tierAcc.autoVipGraceUntil)
    const later = addDays(new Date(), 31)
    await db.refreshAutoTiers(prisma, A, later)
    tierAcc = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { cargoId_phone: { cargoId: A, phone: ph(7) } } })
    assert.equal(tierAcc.autoVipPct, 0)
    assert.equal(tierAcc.autoVipGraceUntil, null)
    // B дээр VIP унтраалттай — A-ийн дүн нөлөөлөхгүй
    const bShip = await ship(B, ph(8), 90000)
    await prisma.$executeRaw`UPDATE "Shipment" SET status = 'PICKED_UP', "updatedAt" = NOW() WHERE id = ${bShip.id}`
    assert.deepEqual(await db.refreshAutoTiers(prisma, B), { checked: 0, changed: 0 })
    assert.equal(await prisma.loyaltyAccount.count({ where: { cargoId: B, phone: ph(8) } }), 0)

    // ── 180 хоног дууссан оноо EXPIRE мөрөөр; давтан дуудахад нэмэгдэхгүй ──
    const oldShip = await ship(A, ph(9), 5000)
    const past = addDays(new Date(), -200)
    await db.performHandover(prisma, { cargoId: A, actor: actorA, shipmentIds: [oldShip.id], requestKey: `old-${seed}` }, past)
    const exp1 = await db.expirePoints(prisma)
    assert.ok(exp1.expiredRows >= 1)
    const expRows = await prisma.loyaltyLedger.findMany({ where: { cargoId: A, kind: 'EXPIRE', account: { phone: ph(9) } } })
    assert.equal(expRows.length, 1)
    assert.equal(expRows[0].points, -5)
    const exp2 = await db.expirePoints(prisma)
    assert.equal(exp2.expiredRows, 0)
    assert.equal(await prisma.loyaltyLedger.count({ where: { cargoId: A, kind: 'EXPIRE', account: { phone: ph(9) } } }), 1)
    const oldView = await db.customerLoyalty(prisma, A, ph(9))
    assert.equal(oldView!.points!.balance, 0)

    // ── Сарын тайлан зөвхөн өөрийн карго ──
    const { ubMonthOf, ubMonthRange } = await import('./loyalty')
    const range = ubMonthRange(ubMonthOf(new Date()))!
    const repA = await db.monthlyReport(prisma, A, range)
    const repB = await db.monthlyReport(prisma, B, range)
    assert.ok(repA.receipts.count > 0)
    assert.equal(repB.receipts.count, 0)
    assert.equal(repB.outstanding.points, 0)
    assert.ok(repA.outstanding.points > 0)
    assert.equal(repB.adjustments.count, 0)
    assert.ok(repA.priceEditsAfterHandover.length > 0)
    assert.equal(repB.priceEditsAfterHandover.length, 0)

    // ── Purge зөвхөн нэг карго; cascade устгалт ledger-ийг авна ──
    const C = await cargo('c')
    const adminC = await user(C, ph(10), 'ADMIN', true)
    await db.saveSettings(prisma, C, actorOf(adminC), { pointsEnabled: true })
    const cShip = await ship(C, ph(11), 3000)
    await db.performHandover(prisma, { cargoId: C, actor: actorOf(adminC), shipmentIds: [cShip.id], requestKey: `c-${seed}` })
    const aLedger = await prisma.loyaltyLedger.count({ where: { cargoId: A } })
    await db.purgeLoyaltyForCargo(prisma, C)
    assert.equal(await prisma.loyaltyLedger.count({ where: { cargoId: C } }), 0)
    assert.equal(await prisma.handoverReceipt.count({ where: { cargoId: C } }), 0)
    assert.equal(await prisma.loyaltyLedger.count({ where: { cargoId: A } }), aLedger)
    assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: cShip.id } })).receiptId, null)

    const D = await cargo('d')
    const adminD = await user(D, ph(12), 'ADMIN', true)
    await db.saveSettings(prisma, D, actorOf(adminD), { pointsEnabled: true })
    const dShip = await ship(D, ph(13), 3000)
    await db.performHandover(prisma, { cargoId: D, actor: actorOf(adminD), shipmentIds: [dShip.id], requestKey: `d-${seed}` })
    assert.ok(await prisma.loyaltyLedger.count({ where: { cargoId: D } }) > 0)
    await prisma.shipment.deleteMany({ where: { cargoId: D } })
    await prisma.user.deleteMany({ where: { cargoId: D } })
    await prisma.cargo.delete({ where: { id: D } })
    assert.equal(await prisma.loyaltyLedger.count({ where: { cargoId: D } }), 0)
    assert.equal(await prisma.loyaltyLedger.count({ where: { cargoId: A } }), aLedger)
  } finally {
    for (const id of created) {
      await prisma.shipment.deleteMany({ where: { cargoId: id } }).catch(() => {})
      await prisma.user.deleteMany({ where: { cargoId: id } }).catch(() => {})
      await prisma.cargo.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  }
})

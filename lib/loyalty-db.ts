// Олголтын баримт + урамшууллын DB үйлдлүүд. Бүх query cargoId-аар хязгаарлагдана.
// Prisma client-ийг параметрээр авна (route нь lib/prisma, тест нь локал DB). next/server import хийхгүй.
import { Prisma, type PrismaClient, type Status } from '@prisma/client'
import {
  type LoyaltyConfig, type LoyaltySettingsInput, type ReceiptTerms, type ReceiptTotals, type LedgerRow, type SkipReason,
  type RedeemBlock, type VipSource, type LedgerKind,
  configFromRow, tierPctForSpend, nextAutoVip, effectiveVip, nextTier, manualVipActive, pointsState, computeReceipt,
  recomputeReceipt, receiptDelta, isZeroDelta, addTotals, maxRedeemablePoints, sumPrices, addDays, fmtMnt,
  VIP_WINDOW_DAYS, POINTS_EXPIRY_DAYS, VIP_PCT_MAX, ZERO_TOTALS, DEFAULT_VIP_TIERS, SKIP_REASON_LABEL,
} from './loyalty'
import { parsePhone } from './phone'

type Db = PrismaClient | Prisma.TransactionClient
export interface Actor { id: number; name: string }

export class LoyaltyError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export async function loadConfig(db: Db, cargoId: number): Promise<LoyaltyConfig> {
  const row = await db.loyaltySettings.findUnique({ where: { cargoId } })
  return configFromRow(row)
}

// ── VIP: 90 хоногийн олгосон дүн ───────────────────────────────────────
// Олгосон ачааны updatedAt = олгосон огноо (үнэ засахад хөдлөхгүй — arrived PATCH). Хуучин (баримтгүй) олголт ч орно

async function spendByPhone(db: Db, cargoId: number, phones: string[], now: Date): Promise<Map<string, number>> {
  if (!phones.length) return new Map()
  const since = addDays(now, -VIP_WINDOW_DAYS)
  const rows = await db.$queryRaw<{ phone: string; spend: number }[]>`
    SELECT COALESCE(s.phone, u.phone) AS phone, COALESCE(SUM(s."adminPrice"), 0)::float8 AS spend
    FROM "Shipment" s LEFT JOIN "User" u ON u.id = s."userId"
    WHERE s."cargoId" = ${cargoId} AND s.status = 'PICKED_UP' AND s."updatedAt" >= ${since}
      AND COALESCE(s.phone, u.phone) = ANY(${phones}::text[])
    GROUP BY 1`
  return new Map(rows.map(r => [r.phone, Math.round(Number(r.spend))]))
}

async function phonesOverThreshold(db: Db, cargoId: number, minSpend: number, now: Date): Promise<Map<string, number>> {
  const since = addDays(now, -VIP_WINDOW_DAYS)
  const rows = await db.$queryRaw<{ phone: string; spend: number }[]>`
    SELECT COALESCE(s.phone, u.phone) AS phone, SUM(s."adminPrice")::float8 AS spend
    FROM "Shipment" s LEFT JOIN "User" u ON u.id = s."userId"
    WHERE s."cargoId" = ${cargoId} AND s.status = 'PICKED_UP' AND s."updatedAt" >= ${since}
      AND COALESCE(s.phone, u.phone) IS NOT NULL
    GROUP BY 1
    HAVING SUM(s."adminPrice") >= ${minSpend}`
  return new Map(rows.filter(r => parsePhone(r.phone) === r.phone).map(r => [r.phone, Math.round(Number(r.spend))]))
}

type AccountRow = {
  id: number; cargoId: number; phone: string; userId: number | null
  manualVipPct: number | null; manualVipUntil: Date | null; manualVipNote: string | null
  autoVipPct: number; autoVipSpend: number; autoVipGraceUntil: Date | null
}

const ACCOUNT_SELECT = {
  id: true, cargoId: true, phone: true, userId: true, manualVipPct: true, manualVipUntil: true, manualVipNote: true,
  autoVipPct: true, autoVipSpend: true, autoVipGraceUntil: true,
} as const

// Зэрэг олголт нэг хэрэглэгчийн оноог давхар зарцуулахгүй — данс мөрийг транзакцын туршид түгжинэ
async function lockAccount(tx: Prisma.TransactionClient, cargoId: number, phone: string, userId: number | null): Promise<AccountRow> {
  await tx.$executeRaw`
    INSERT INTO "LoyaltyAccount" ("cargoId", phone, "userId", "updatedAt")
    VALUES (${cargoId}, ${phone}, ${userId}, NOW())
    ON CONFLICT ("cargoId", phone) DO NOTHING`
  const [row] = await tx.$queryRaw<AccountRow[]>`
    SELECT id, "cargoId", phone, "userId", "manualVipPct", "manualVipUntil", "manualVipNote",
      "autoVipPct", "autoVipSpend", "autoVipGraceUntil"
    FROM "LoyaltyAccount" WHERE "cargoId" = ${cargoId} AND phone = ${phone} FOR UPDATE`
  if (userId && row.userId !== userId) {
    await tx.loyaltyAccount.update({ where: { id: row.id }, data: { userId } })
    row.userId = userId
  }
  return row
}

async function ledgerRows(db: Db, cargoId: number, accountId: number): Promise<LedgerRow[]> {
  return db.loyaltyLedger.findMany({
    where: { cargoId, accountId },
    select: { id: true, kind: true, points: true, createdAt: true, expiresAt: true, refLedgerId: true },
  })
}

async function phoneOwner(db: Db, cargoId: number, phone: string) {
  return db.user.findFirst({ where: { cargoId, phone }, select: { id: true, role: true, phoneVerifiedAt: true } })
}

// Автомат шатыг одоогийн 90 хоногийн дүнгээр тооцож, grace-ийг хэрэглэнэ. persist=false бол DB-д бичихгүй (урьдчилсан харагдац)
async function evaluateAutoVip(db: Db, account: Pick<AccountRow, 'id' | 'cargoId' | 'phone' | 'autoVipPct' | 'autoVipSpend' | 'autoVipGraceUntil'> | null,
  cargoId: number, phone: string, config: LoyaltyConfig, now: Date, persist: boolean) {
  const spend = (await spendByPhone(db, cargoId, [phone], now)).get(phone) ?? 0
  const computed = tierPctForSpend(spend, config.vipTiers)
  const next = nextAutoVip({ pct: account?.autoVipPct ?? 0, graceUntil: account?.autoVipGraceUntil ?? null }, computed, now)
  if (persist && account) {
    await db.loyaltyAccount.update({
      where: { id: account.id, cargoId },
      data: { autoVipPct: next.pct, autoVipGraceUntil: next.graceUntil, autoVipSpend: spend, autoVipCheckedAt: now },
    })
  }
  return { spend, computed, pct: next.pct, graceUntil: next.graceUntil }
}

// ── Олголт ─────────────────────────────────────────────────────────────

export interface HandoverLine { id: number; trackCode: string; price: number }
interface ShipmentForHandover { id: number; trackCode: string; phone: string | null; adminPrice: unknown; userId: number | null; userPhone: string | null }
interface PhoneGroup { phone: string | null; userId: number | null; lines: HandoverLine[] }

// 1 трак = 1 эзэн: Shipment.phone, байхгүй бол эзэн хэрэглэгчийн утас
function groupByOwner(rows: ShipmentForHandover[]): PhoneGroup[] {
  const map = new Map<string, PhoneGroup>()
  for (const r of rows) {
    const phone = parsePhone(r.phone) ?? parsePhone(r.userPhone)
    const key = phone ?? '-'
    if (!map.has(key)) map.set(key, { phone, userId: null, lines: [] })
    const g = map.get(key)!
    if (r.userId && !g.userId) g.userId = r.userId
    g.lines.push({ id: r.id, trackCode: r.trackCode, price: r.adminPrice == null ? 0 : Number(r.adminPrice) })
  }
  return [...map.values()]
}

export type RedeemRequest = { phone: string; points: number | 'max' } | null

export interface GroupPlan {
  phone: string | null
  userId: number | null
  accountId: number | null
  lines: HandoverLine[]
  skipReason: SkipReason | null
  vip: { pct: number; source: VipSource | null; spend: number; graceUntil: Date | null } | null
  points: { available: number; maxRedeem: number; block: RedeemBlock | null; pointValueMnt: number; earning: boolean } | null
  terms: ReceiptTerms
  totals: ReceiptTotals
  requestedRedeem: number
}

async function planGroup(db: Db, cargoId: number, config: LoyaltyConfig, g: PhoneGroup, redeem: RedeemRequest, now: Date,
  tx: Prisma.TransactionClient | null): Promise<GroupPlan> {
  const gross = sumPrices(g.lines.map(l => l.price))
  const noLoyalty = (skipReason: SkipReason): GroupPlan => ({
    phone: g.phone, userId: g.userId, accountId: null, lines: g.lines, skipReason, vip: null, points: null,
    terms: { vipPct: 0, mntPerPoint: null, pointValueMnt: null },
    totals: computeReceipt(gross, { vipPct: 0, mntPerPoint: null, pointValueMnt: null }, 0), requestedRedeem: 0,
  })
  if (!config.exists) return noLoyalty('OFF')
  if (!g.phone) return noLoyalty('NO_PHONE')
  const owner = await phoneOwner(db, cargoId, g.phone)
  if (owner && owner.role !== 'USER') return noLoyalty('STAFF_PHONE')
  const userId = owner?.id ?? g.userId

  // Урамшуулал унтраалттай ч хуучин үлдэгдлээ зарцуулж болно — тиймээс данс байвал оноог шалгана
  const account = tx
    ? await (config.vipEnabled || config.pointsEnabled
      ? lockAccount(tx, cargoId, g.phone, userId)
      : tx.loyaltyAccount.findUnique({ where: { cargoId_phone: { cargoId, phone: g.phone } }, select: ACCOUNT_SELECT }))
    : await db.loyaltyAccount.findUnique({ where: { cargoId_phone: { cargoId, phone: g.phone } }, select: ACCOUNT_SELECT })
  if (!config.vipEnabled && !config.pointsEnabled && !account) return noLoyalty('OFF')

  let vip: GroupPlan['vip'] = null
  if (config.vipEnabled) {
    const auto = await evaluateAutoVip(db, account, cargoId, g.phone, config, now, !!tx)
    const eff = effectiveVip({ pct: account?.manualVipPct ?? null, until: account?.manualVipUntil ?? null }, auto.pct, now)
    vip = { pct: eff.pct, source: eff.source, spend: auto.spend, graceUntil: auto.graceUntil }
  }
  const vipPct = vip?.pct ?? 0

  let available = 0
  if (account) {
    if (tx && !(config.vipEnabled || config.pointsEnabled)) {
      await tx.$queryRaw`SELECT id FROM "LoyaltyAccount" WHERE id = ${account.id} FOR UPDATE`
    }
    available = pointsState(await ledgerRows(db, cargoId, account.id), now).available
  }
  const block: RedeemBlock | null = available <= 0 ? 'NO_BALANCE' : !owner ? 'NOT_REGISTERED' : !owner.phoneVerifiedAt ? 'NOT_VERIFIED' : null
  const maxRedeem = block ? 0 : maxRedeemablePoints(gross, vipPct, config.pointValueMnt, available)
  const showPoints = config.pointsEnabled || available > 0
  const terms: ReceiptTerms = {
    vipPct,
    mntPerPoint: config.pointsEnabled ? config.mntPerPoint : null,
    pointValueMnt: config.pointValueMnt,
  }
  const requestedRedeem = redeem && redeem.phone === g.phone ? (redeem.points === 'max' ? maxRedeem : Math.max(0, Math.floor(redeem.points))) : 0
  return {
    phone: g.phone, userId, accountId: account?.id ?? null, lines: g.lines, skipReason: null, vip,
    points: showPoints ? { available, maxRedeem, block, pointValueMnt: config.pointValueMnt, earning: config.pointsEnabled } : null,
    terms, totals: computeReceipt(gross, terms, Math.min(requestedRedeem, maxRedeem)), requestedRedeem,
  }
}

const SHIPMENT_FOR_HANDOVER = (cargoId: number, ids: number[], lock: boolean) => Prisma.sql`
  SELECT s.id, s."trackCode", s.phone, s."adminPrice", s."userId", u.phone AS "userPhone"
  FROM "Shipment" s LEFT JOIN "User" u ON u.id = s."userId"
  WHERE s.id = ANY(${ids}::int[]) AND s."cargoId" = ${cargoId} AND s.status = 'ARRIVED'
  ORDER BY s.id ${lock ? Prisma.sql`FOR UPDATE OF s` : Prisma.empty}`

export function planSummary(plans: GroupPlan[]) {
  return plans.reduce((t, p) => addTotals(t, p.totals), ZERO_TOTALS)
}

// Олгохын өмнөх урьдчилсан тооцоо — юу ч бичихгүй
export async function quoteHandover(db: PrismaClient, cargoId: number, shipmentIds: number[], redeem: RedeemRequest, now = new Date()) {
  const config = await loadConfig(db, cargoId)
  const rows = await db.$queryRaw<ShipmentForHandover[]>(SHIPMENT_FOR_HANDOVER(cargoId, shipmentIds, false))
  const plans = []
  for (const g of groupByOwner(rows)) plans.push(await planGroup(db, cargoId, config, g, redeem, now, null))
  return { config, plans, totals: planSummary(plans), count: rows.length }
}

export interface HandoverInput {
  cargoId: number
  actor: Actor
  shipmentIds: number[]
  requestKey?: string | null
  redeem?: RedeemRequest
  expectedNetMnt?: number | null
}

export type ReceiptView = Awaited<ReturnType<typeof receiptsByRequestKey>>[number]

async function receiptsByRequestKey(db: Db, cargoId: number, requestKey: string) {
  return db.handoverReceipt.findMany({ where: { cargoId, requestKey }, orderBy: { id: 'asc' } })
}

// «Олгох»: ачаа PICKED_UP + баримт + онооны бичилт НЭГ транзакцид. Давтан хүсэлт (ижил requestKey эсвэл аль хэдийн
// олгосон ачаа) шинэ баримт, оноо үүсгэхгүй — Shipment мөрийг FOR UPDATE түгжиж, status = 'ARRIVED'-ийг дахин шалгана
export async function performHandover(db: PrismaClient, input: HandoverInput, now = new Date()) {
  const { cargoId, actor, requestKey } = input
  const ids = [...new Set(input.shipmentIds.map(Number).filter(n => Number.isInteger(n) && n > 0))]
  if (requestKey) {
    const prior = await receiptsByRequestKey(db, cargoId, requestKey)
    if (prior.length) return { replayed: true, count: prior.reduce((s, r) => s + r.shipmentCount, 0), receipts: prior }
  }
  if (!ids.length) return { replayed: false, count: 0, receipts: [] }

  const run = () => db.$transaction(async tx => {
    const rows = await tx.$queryRaw<ShipmentForHandover[]>(SHIPMENT_FOR_HANDOVER(cargoId, ids, true))
    if (!rows.length) {
      const prior = requestKey ? await receiptsByRequestKey(tx, cargoId, requestKey) : []
      return { replayed: prior.length > 0, count: prior.reduce((s, r) => s + r.shipmentCount, 0), receipts: prior }
    }
    const config = await loadConfig(tx, cargoId)
    const groups = groupByOwner(rows)
    const redeem = input.redeem ?? null
    if (redeem && !groups.some(g => g.phone === redeem.phone)) throw new LoyaltyError('Оноо ашиглах утас сонгосон ачаанд алга', 409)

    const plans: GroupPlan[] = []
    for (const g of groups) plans.push(await planGroup(tx, cargoId, config, g, redeem, now, tx))
    for (const p of plans) {
      if (p.requestedRedeem > 0 && p.requestedRedeem > (p.points?.maxRedeem ?? 0)) {
        throw new LoyaltyError(`Оноо хүрэлцэхгүй эсвэл хязгаар хэтэрсэн (${p.requestedRedeem} > ${p.points?.maxRedeem ?? 0}). Дахин шалгана уу`, 409)
      }
    }
    const totals = planSummary(plans)
    if (input.expectedNetMnt != null && Math.round(input.expectedNetMnt) !== totals.netMnt) {
      throw new LoyaltyError(`Төлөх дүн өөрчлөгдсөн (${fmtMnt(input.expectedNetMnt)} → ${fmtMnt(totals.netMnt)}). Дахин шалгана уу`, 409)
    }

    const receipts = []
    for (const p of plans) {
      const t = p.totals
      const receipt = await tx.handoverReceipt.create({
        data: {
          cargoId, requestKey: requestKey ?? null, idemKey: requestKey ? `${requestKey}:${p.phone ?? '-'}` : null,
          phone: p.phone, userId: p.userId, accountId: p.accountId,
          lines: p.lines as unknown as Prisma.InputJsonValue, shipmentCount: p.lines.length,
          grossMnt: t.grossMnt, vipPct: p.terms.vipPct, vipSource: p.terms.vipPct > 0 ? p.vip?.source ?? null : null,
          discountMnt: t.discountMnt, redeemedPoints: t.redeemedPoints, redeemedMnt: t.redeemedMnt, netMnt: t.netMnt,
          earnedPoints: t.earnedPoints, mntPerPoint: p.terms.mntPerPoint,
          pointValueMnt: t.redeemedPoints > 0 || p.terms.mntPerPoint ? p.terms.pointValueMnt : null,
          skipReason: p.skipReason, createdById: actor.id, createdByName: actor.name, createdAt: now,
        },
      })
      const { count } = await tx.shipment.updateMany({
        where: { id: { in: p.lines.map(l => l.id) }, cargoId, status: 'ARRIVED' },
        data: { status: 'PICKED_UP', receiptId: receipt.id },
      })
      if (count !== p.lines.length) throw new LoyaltyError('Ачааны төлөв өөрчлөгдсөн байна. Дахин оролдоно уу', 409)
      if (p.accountId && t.redeemedPoints > 0) {
        await tx.loyaltyLedger.create({ data: {
          cargoId, accountId: p.accountId, kind: 'REDEEM', points: -t.redeemedPoints, receiptId: receipt.id,
          dedupeKey: `redeem:R${receipt.id}`, actorId: actor.id, actorName: actor.name, createdAt: now,
        } })
      }
      if (p.accountId && t.earnedPoints > 0) {
        await tx.loyaltyLedger.create({ data: {
          cargoId, accountId: p.accountId, kind: 'EARN', points: t.earnedPoints, receiptId: receipt.id,
          expiresAt: addDays(now, POINTS_EXPIRY_DAYS), dedupeKey: `earn:R${receipt.id}`,
          actorId: actor.id, actorName: actor.name, createdAt: now,
        } })
      }
      receipts.push(receipt)
    }

    // Хэнд, ямар ачаа, ямар дүнгээр олгосныг (маргаан гарвал) — баримттай нэг транзакцид
    const codes = rows.map(r => r.trackCode)
    const phones = [...new Set(plans.map(p => p.phone).filter(Boolean))]
    await tx.adminAuditLog.create({ data: {
      cargoId, userId: actor.id, userName: actor.name, action: 'shipment:handover',
      detail: [
        `${rows.length} ачаа`,
        phones.length ? phones.slice(0, 2).join(', ') + (phones.length > 2 ? ` +${phones.length - 2}` : '') : null,
        totals.grossMnt > 0 ? fmtMnt(totals.grossMnt) : null,
        totals.discountMnt > 0 ? `VIP −${fmtMnt(totals.discountMnt)}` : null,
        totals.redeemedPoints > 0 ? `оноо −${totals.redeemedPoints} (${fmtMnt(totals.redeemedMnt)})` : null,
        totals.earnedPoints > 0 ? `+${totals.earnedPoints} оноо` : null,
        `баримт ${receipts.map(r => '#' + r.id).join(', ')}`,
        codes.slice(0, 5).join(', ') + (codes.length > 5 ? ` +${codes.length - 5}` : ''),
      ].filter(Boolean).join(' · ').slice(0, 1000),
    } })
    return { replayed: false, count: rows.length, receipts }
  }, { timeout: 20_000, maxWait: 10_000 })

  try {
    return await run()
  } catch (e) {
    // Ижил requestKey-тэй зэрэг хүсэлт эхэлж commit хийсэн — түүний баримтыг буцаана
    if (requestKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const prior = await receiptsByRequestKey(db, cargoId, requestKey)
      if (prior.length) return { replayed: true, count: prior.reduce((s, r) => s + r.shipmentCount, 0), receipts: prior }
    }
    throw e
  }
}

// ── Олгосны дараах залруулга ───────────────────────────────────────────

export function receiptTotals(r: { grossMnt: number; discountMnt: number; redeemedPoints: number; redeemedMnt: number; netMnt: number; earnedPoints: number }): ReceiptTotals {
  return { grossMnt: r.grossMnt, discountMnt: r.discountMnt, redeemedPoints: r.redeemedPoints, redeemedMnt: r.redeemedMnt, netMnt: r.netMnt, earnedPoints: r.earnedPoints }
}

function adjustmentTotals(a: { grossDelta: number; discountDelta: number; redeemedPointsDelta: number; redeemedMntDelta: number; netDelta: number; earnedPointsDelta: number }): ReceiptTotals {
  return { grossMnt: a.grossDelta, discountMnt: a.discountDelta, redeemedPoints: a.redeemedPointsDelta, redeemedMnt: a.redeemedMntDelta, netMnt: a.netDelta, earnedPoints: a.earnedPointsDelta }
}

export type CorrectionReason = 'PRICE_EDIT' | 'PICKUP_REVERT'

// Баримтын одоогийн ачаануудын (PICKED_UP, receiptId = энэ) үнээр дахин бодож, зөрүүг шинэ мөрөөр бичнэ.
// Баримт, өмнөх ledger мөрийг хэзээ ч засахгүй
export async function correctReceipt(tx: Prisma.TransactionClient, args: {
  cargoId: number; receiptId: number; reason: CorrectionReason; shipmentId?: number | null; actor: Actor; note?: string | null
}, now = new Date()) {
  const { cargoId, receiptId, actor } = args
  const locked = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM "HandoverReceipt" WHERE id = ${receiptId} AND "cargoId" = ${cargoId} FOR UPDATE`
  if (!locked.length) return null
  const receipt = await tx.handoverReceipt.findUniqueOrThrow({ where: { id: receiptId }, include: { adjustments: true } })
  const current = receipt.adjustments.reduce((t, a) => addTotals(t, adjustmentTotals(a)), receiptTotals(receipt))
  const shipments = await tx.shipment.findMany({
    where: { cargoId, receiptId, status: 'PICKED_UP' }, select: { adminPrice: true },
  })
  const terms: ReceiptTerms = { vipPct: receipt.vipPct, mntPerPoint: receipt.mntPerPoint, pointValueMnt: receipt.pointValueMnt }
  const next = recomputeReceipt(current, sumPrices(shipments.map(s => s.adminPrice)), terms)
  const d = receiptDelta(current, next)
  if (isZeroDelta(d)) return null

  const adj = await tx.handoverReceiptAdjustment.create({ data: {
    cargoId, receiptId, shipmentId: args.shipmentId ?? null, reason: args.reason,
    grossDelta: d.grossMnt, discountDelta: d.discountMnt, redeemedPointsDelta: d.redeemedPoints,
    redeemedMntDelta: d.redeemedMnt, netDelta: d.netMnt, earnedPointsDelta: d.earnedPoints,
    note: args.note ?? null, actorId: actor.id, actorName: actor.name, createdAt: now,
  } })
  const expiresAt = addDays(receipt.createdAt, POINTS_EXPIRY_DAYS)
  if (receipt.accountId && d.earnedPoints !== 0) {
    await tx.loyaltyLedger.create({ data: {
      cargoId, accountId: receipt.accountId, kind: 'ADJUST', points: d.earnedPoints, receiptId, adjustmentId: adj.id,
      expiresAt: d.earnedPoints > 0 ? expiresAt : null, dedupeKey: `adj:A${adj.id}:earn`,
      note: args.reason, actorId: actor.id, actorName: actor.name, createdAt: now,
    } })
  }
  if (receipt.accountId && d.redeemedPoints < 0) {
    await tx.loyaltyLedger.create({ data: {
      cargoId, accountId: receipt.accountId, kind: 'REDEEM_REFUND', points: -d.redeemedPoints, receiptId, adjustmentId: adj.id,
      expiresAt, dedupeKey: `adj:A${adj.id}:refund`, note: args.reason, actorId: actor.id, actorName: actor.name, createdAt: now,
    } })
  }
  return adj
}

// adminPrice засвар бүрийг бүртгэнэ; олгосон ачааных бол баримтыг залруулна. Shipment-ийг аль хэдийн шинэчилсэн tx дотор дуудна
export async function recordPriceChange(tx: Prisma.TransactionClient, args: {
  cargoId: number; shipment: { id: number; trackCode: string; status: Status; receiptId: number | null }
  oldPrice: unknown; newPrice: unknown; actor: Actor; source: string
}, now = new Date()) {
  const { cargoId, shipment, actor } = args
  const toDec = (v: unknown) => (v == null ? null : new Prisma.Decimal(Number(v)))
  await tx.shipmentPriceLog.create({ data: {
    cargoId, shipmentId: shipment.id, trackCode: shipment.trackCode, oldPrice: toDec(args.oldPrice), newPrice: toDec(args.newPrice),
    status: shipment.status, receiptId: shipment.receiptId, source: args.source,
    actorId: actor.id, actorName: actor.name, createdAt: now,
  } })
  if (shipment.status === 'PICKED_UP' && shipment.receiptId) {
    return correctReceipt(tx, { cargoId, receiptId: shipment.receiptId, reason: 'PRICE_EDIT', shipmentId: shipment.id, actor,
      note: `${shipment.trackCode}: ${args.oldPrice == null ? '—' : fmtMnt(Number(args.oldPrice))} → ${args.newPrice == null ? '—' : fmtMnt(Number(args.newPrice))}` }, now)
  }
  return null
}

// «Олгосон»-оос «Ирсэн» рүү буцаах (app/api/admin/history PATCH)
export async function revertPickup(db: PrismaClient, args: { cargoId: number; shipmentId: number; actor: Actor }, now = new Date()) {
  return db.$transaction(async tx => {
    const [row] = await tx.$queryRaw<{ id: number; trackCode: string; receiptId: number | null }[]>`
      SELECT id, "trackCode", "receiptId" FROM "Shipment"
      WHERE id = ${args.shipmentId} AND "cargoId" = ${args.cargoId} AND status = 'PICKED_UP' FOR UPDATE`
    if (!row) return null
    await tx.shipment.update({ where: { id: row.id, cargoId: args.cargoId }, data: { status: 'ARRIVED', receiptId: null } })
    const adjustment = row.receiptId
      ? await correctReceipt(tx, { cargoId: args.cargoId, receiptId: row.receiptId, reason: 'PICKUP_REVERT', shipmentId: row.id, actor: args.actor, note: row.trackCode }, now)
      : null
    return { trackCode: row.trackCode, receiptId: row.receiptId, adjustment }
  })
}

// ── Тохиргоо, VIP гараар ───────────────────────────────────────────────

export async function saveSettings(db: PrismaClient, cargoId: number, actor: Actor, input: LoyaltySettingsInput) {
  return db.$transaction(async tx => {
    const before = await loadConfig(tx, cargoId)
    const data = {
      ...(input.vipEnabled !== undefined ? { vipEnabled: input.vipEnabled } : {}),
      ...(input.pointsEnabled !== undefined ? { pointsEnabled: input.pointsEnabled } : {}),
      ...(input.vipTiers ? { vipTiers: input.vipTiers as unknown as Prisma.InputJsonValue } : {}),
      ...(input.mntPerPoint !== undefined ? { mntPerPoint: input.mntPerPoint } : {}),
      ...(input.pointValueMnt !== undefined ? { pointValueMnt: input.pointValueMnt } : {}),
      updatedById: actor.id, updatedByName: actor.name,
    }
    const row = await tx.loyaltySettings.upsert({
      where: { cargoId },
      create: { cargoId, vipTiers: DEFAULT_VIP_TIERS as unknown as Prisma.InputJsonValue, ...data },
      update: data,
    })
    const after = configFromRow(row)
    const onOff = (v: boolean) => (v ? 'асаасан' : 'унтраасан')
    const tiersText = (c: LoyaltyConfig) => c.vipTiers.map(t => `${fmtMnt(t.minSpend)}→${t.pct}%`).join(', ')
    const changes: string[] = []
    if (before.vipEnabled !== after.vipEnabled) changes.push(`VIP: ${onOff(after.vipEnabled)}`)
    if (before.pointsEnabled !== after.pointsEnabled) changes.push(`Оноо: ${onOff(after.pointsEnabled)}`)
    if (tiersText(before) !== tiersText(after)) changes.push(`VIP шат: ${tiersText(before)} → ${tiersText(after)}`)
    if (before.mntPerPoint !== after.mntPerPoint) changes.push(`₮/оноо: ${before.mntPerPoint} → ${after.mntPerPoint}`)
    if (before.pointValueMnt !== after.pointValueMnt) changes.push(`оноон үнэ: ₮${before.pointValueMnt} → ₮${after.pointValueMnt}`)
    if (changes.length) {
      await tx.adminAuditLog.create({ data: { cargoId, userId: actor.id, userName: actor.name, action: 'loyalty:settings', detail: changes.join('; ').slice(0, 1000) } })
    }
    return after
  })
}

export async function setManualVip(db: PrismaClient, cargoId: number, actor: Actor & { phone?: string | null }, input: {
  phone: unknown; pct: unknown; note: unknown; until: unknown
}, now = new Date()) {
  const phone = parsePhone(input.phone)
  if (!phone) throw new LoyaltyError('Утасны дугаар буруу')
  const pct = input.pct == null || input.pct === '' || input.pct === 0 ? null : Number(input.pct)
  if (pct !== null && (!Number.isInteger(pct) || pct < 1 || pct > VIP_PCT_MAX)) throw new LoyaltyError(`Хөнгөлөлт 1–${VIP_PCT_MAX}% байна`)
  const note = String(input.note ?? '').trim().slice(0, 300)
  if (pct !== null && !note) throw new LoyaltyError('Шалтгаан заавал бичнэ')
  let until: Date | null = null
  if (pct !== null && input.until) {
    until = new Date(`${String(input.until)}T23:59:59+08:00`)
    if (isNaN(until.getTime()) || until.getTime() <= now.getTime()) throw new LoyaltyError('Дуусах огноо ирээдүйд байна')
  }
  if (actor.phone && actor.phone === phone) throw new LoyaltyError('Өөрийн утсанд VIP оноох боломжгүй', 403)
  return db.$transaction(async tx => {
    const owner = await phoneOwner(tx, cargoId, phone)
    if (owner && owner.role !== 'USER') throw new LoyaltyError('Ажилтны утсанд VIP оноох боломжгүй', 403)
    const account = await lockAccount(tx, cargoId, phone, owner?.id ?? null)
    const updated = await tx.loyaltyAccount.update({
      where: { id: account.id, cargoId },
      data: pct === null
        ? { manualVipPct: null, manualVipNote: note || null, manualVipUntil: null, manualVipById: actor.id, manualVipByName: actor.name, manualVipAt: now }
        : { manualVipPct: pct, manualVipNote: note, manualVipUntil: until, manualVipById: actor.id, manualVipByName: actor.name, manualVipAt: now },
      select: ACCOUNT_SELECT,
    })
    await tx.adminAuditLog.create({ data: {
      cargoId, userId: actor.id, userName: actor.name, action: 'loyalty:vip-manual',
      detail: `${phone}: ${account.manualVipPct ? account.manualVipPct + '%' : '—'} → ${pct ? pct + '%' : 'цуцалсан'}${until ? ` (${until.toISOString().slice(0, 10)} хүртэл)` : ''}${note ? ' · ' + note : ''}`.slice(0, 1000),
    } })
    return updated
  })
}

// ── Cron: автомат шат, онооны хугацаа ──────────────────────────────────

export async function refreshAutoTiers(db: PrismaClient, cargoId: number, now = new Date()) {
  const config = await loadConfig(db, cargoId)
  if (!config.vipEnabled) return { checked: 0, changed: 0 }
  const minSpend = Math.min(...config.vipTiers.map(t => t.minSpend))
  const spends = await phonesOverThreshold(db, cargoId, minSpend, now)
  const tracked = await db.loyaltyAccount.findMany({
    where: { cargoId, OR: [{ autoVipPct: { gt: 0 } }, { autoVipGraceUntil: { not: null } }] }, select: { phone: true },
  })
  const phones = [...new Set([...spends.keys(), ...tracked.map(t => t.phone)])]
  let changed = 0
  for (let i = 0; i < phones.length; i += 200) {
    const chunk = phones.slice(i, i + 200)
    changed += await db.$transaction(async tx => {
      await tx.loyaltyAccount.createMany({ data: chunk.map(phone => ({ cargoId, phone })), skipDuplicates: true })
      const accounts = await tx.loyaltyAccount.findMany({ where: { cargoId, phone: { in: chunk } }, select: ACCOUNT_SELECT })
      let n = 0
      for (const a of accounts) {
        const spend = spends.get(a.phone) ?? 0
        const next = nextAutoVip({ pct: a.autoVipPct, graceUntil: a.autoVipGraceUntil }, tierPctForSpend(spend, config.vipTiers), now)
        const same = next.pct === a.autoVipPct && next.graceUntil?.getTime() === a.autoVipGraceUntil?.getTime() && spend === a.autoVipSpend
        if (same) continue
        await tx.loyaltyAccount.update({
          where: { id: a.id, cargoId },
          data: { autoVipPct: next.pct, autoVipGraceUntil: next.graceUntil, autoVipSpend: spend, autoVipCheckedAt: now },
        })
        n++
      }
      return n
    }, { timeout: 30_000 })
  }
  return { checked: phones.length, changed }
}

// Хугацаа нь дууссан лотын үлдэгдлийг EXPIRE мөрөөр бүртгэнэ (үлдэгдлийн тооцоо үүнээс үл хамааран зөв)
export async function expirePoints(db: PrismaClient, now = new Date(), lookbackDays = 30) {
  const from = addDays(now, -lookbackDays)
  const accounts = await db.$queryRaw<{ accountId: number; cargoId: number }[]>`
    SELECT DISTINCT l."accountId", l."cargoId" FROM "LoyaltyLedger" l
    WHERE l.points > 0 AND l."expiresAt" > ${from} AND l."expiresAt" <= ${now}
      AND NOT EXISTS (SELECT 1 FROM "LoyaltyLedger" e WHERE e."cargoId" = l."cargoId" AND e."dedupeKey" = 'expire:L' || l.id)`
  let rows = 0
  for (const a of accounts) {
    rows += await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "LoyaltyAccount" WHERE id = ${a.accountId} AND "cargoId" = ${a.cargoId} FOR UPDATE`
      const state = pointsState(await ledgerRows(tx, a.cargoId, a.accountId), now)
      if (!state.dueExpiry.length) return 0
      const r = await tx.loyaltyLedger.createMany({
        data: state.dueExpiry.map(d => ({
          cargoId: a.cargoId, accountId: a.accountId, kind: 'EXPIRE', points: -d.points, refLedgerId: d.lotId,
          dedupeKey: `expire:L${d.lotId}`, note: `${POINTS_EXPIRY_DAYS} хоног`, createdAt: now,
        })),
        skipDuplicates: true,
      })
      return r.count
    })
  }
  return { accounts: accounts.length, expiredRows: rows }
}

// Демо каргог өдөр бүр анхны байдалд оруулахад (lib/demo-seed) — append-only trigger-ийг зөвхөн энэ транзакцид нээнэ
export async function purgeLoyaltyForCargo(db: PrismaClient, cargoId: number) {
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL aicargo.loyalty_purge = 'on'`)
    await tx.loyaltyLedger.deleteMany({ where: { cargoId } })
    await tx.handoverReceiptAdjustment.deleteMany({ where: { cargoId } })
    await tx.shipment.updateMany({ where: { cargoId, receiptId: { not: null } }, data: { receiptId: null } })
    await tx.handoverReceipt.deleteMany({ where: { cargoId } })
    await tx.loyaltyAccount.deleteMany({ where: { cargoId } })
    await tx.shipmentPriceLog.deleteMany({ where: { cargoId } })
  })
}

// ── Харагдац: хэрэглэгч, админ ─────────────────────────────────────────

export type ReceiptRow = Awaited<ReturnType<typeof receiptHistory>>[number]

export async function receiptHistory(db: Db, cargoId: number, phone: string, take = 20) {
  const rows = await db.handoverReceipt.findMany({
    where: { cargoId, phone }, orderBy: { createdAt: 'desc' }, take,
    include: { adjustments: { orderBy: { id: 'asc' } } },
  })
  return rows.map(r => {
    const current = r.adjustments.reduce((t, a) => addTotals(t, adjustmentTotals(a)), receiptTotals(r))
    return {
      id: r.id, createdAt: r.createdAt, shipmentCount: r.shipmentCount, lines: r.lines as unknown as HandoverLine[],
      vipPct: r.vipPct, vipSource: r.vipSource, pointValueMnt: r.pointValueMnt,
      original: receiptTotals(r), current,
      adjustments: r.adjustments.map(a => ({ id: a.id, reason: a.reason, createdAt: a.createdAt, note: a.note, delta: adjustmentTotals(a) })),
    }
  })
}

// Хэрэглэгчийн өөрийнх нь (утсаар, өөрийн каргод). Зөвхөн уншина
export async function customerLoyalty(db: Db, cargoId: number, phone: string, now = new Date()) {
  const config = await loadConfig(db, cargoId)
  const account = await db.loyaltyAccount.findUnique({ where: { cargoId_phone: { cargoId, phone } }, select: ACCOUNT_SELECT })
  const ledger = account ? await ledgerRows(db, cargoId, account.id) : []
  const points = pointsState(ledger, now)
  const showPoints = config.pointsEnabled || points.available > 0
  if (!config.vipEnabled && !showPoints) return null

  let vip = null
  if (config.vipEnabled) {
    const auto = await evaluateAutoVip(db, account, cargoId, phone, config, now, false)
    const eff = effectiveVip({ pct: account?.manualVipPct ?? null, until: account?.manualVipUntil ?? null }, auto.pct, now)
    vip = {
      pct: eff.pct, source: eff.source, spend: auto.spend, graceUntil: auto.graceUntil?.toISOString() ?? null,
      manualUntil: eff.source === 'MANUAL' ? account?.manualVipUntil?.toISOString() ?? null : null,
      next: nextTier(auto.spend, config.vipTiers, eff.pct),
      tiers: config.vipTiers, windowDays: VIP_WINDOW_DAYS,
    }
  }
  const owner = await phoneOwner(db, cargoId, phone)
  const receipts = (await receiptHistory(db, cargoId, phone, 10))
    .filter(r => r.current.discountMnt > 0 || r.current.redeemedPoints > 0 || r.current.earnedPoints > 0 || r.adjustments.length)
  return {
    vip,
    points: showPoints ? {
      enabled: config.pointsEnabled, balance: points.available, pointValueMnt: config.pointValueMnt, mntPerPoint: config.mntPerPoint,
      valueMnt: points.available * config.pointValueMnt, expiryDays: POINTS_EXPIRY_DAYS,
      expiringSoon: points.expiringSoon.points > 0 ? { points: points.expiringSoon.points, at: points.expiringSoon.at?.toISOString() ?? null } : null,
      canRedeem: !!owner?.phoneVerifiedAt,
    } : null,
    receipts: JSON.parse(JSON.stringify(receipts)) as unknown[],
  }
}
export type CustomerLoyalty = NonNullable<Awaited<ReturnType<typeof customerLoyalty>>>

// Админ: нэг хэрэглэгчийн дэлгэрэнгүй (утсаар)
export async function adminCustomerDetail(db: Db, cargoId: number, phone: string, now = new Date()) {
  const config = await loadConfig(db, cargoId)
  const [account, owner] = await Promise.all([
    db.loyaltyAccount.findUnique({ where: { cargoId_phone: { cargoId, phone } }, select: { ...ACCOUNT_SELECT, manualVipByName: true, manualVipAt: true } }),
    db.user.findFirst({ where: { cargoId, phone }, select: { id: true, name: true, role: true, phoneVerifiedAt: true } }),
  ])
  const ledger = account
    ? await db.loyaltyLedger.findMany({ where: { cargoId, accountId: account.id }, orderBy: { id: 'desc' }, take: 100 })
    : []
  const state = pointsState(account ? await ledgerRows(db, cargoId, account.id) : [], now)
  const auto = await evaluateAutoVip(db, account, cargoId, phone, config, now, false)
  const eff = effectiveVip({ pct: account?.manualVipPct ?? null, until: account?.manualVipUntil ?? null }, auto.pct, now)
  return {
    phone, config, owner, account,
    vip: { pct: eff.pct, source: eff.source, spend: auto.spend, autoPct: auto.pct, graceUntil: auto.graceUntil, computedPct: auto.computed,
      manualActive: account ? manualVipActive({ pct: account.manualVipPct, until: account.manualVipUntil }, now) : false },
    points: { balance: state.available, debt: state.debt, expiringSoon: state.expiringSoon },
    ledger: ledger.map(l => ({ id: l.id, kind: l.kind as LedgerKind, points: l.points, createdAt: l.createdAt, expiresAt: l.expiresAt, receiptId: l.receiptId, note: l.note, actorName: l.actorName })),
    receipts: await receiptHistory(db, cargoId, phone, 20),
  }
}

export async function vipList(db: Db, cargoId: number, now = new Date(), filter: { pct?: number | null; q?: string | null } = {}) {
  const config = await loadConfig(db, cargoId)
  const accounts = await db.loyaltyAccount.findMany({
    where: {
      cargoId,
      OR: [{ manualVipPct: { not: null } }, { autoVipPct: { gt: 0 } }, { autoVipGraceUntil: { not: null } }],
      ...(filter.q ? { phone: { contains: filter.q.replace(/\D/g, '') } } : {}),
    },
    select: { ...ACCOUNT_SELECT, manualVipByName: true, manualVipAt: true, autoVipCheckedAt: true },
    take: 2000,
  })
  const users = await db.user.findMany({
    where: { cargoId, phone: { in: accounts.map(a => a.phone) } }, select: { phone: true, name: true, phoneVerifiedAt: true },
  })
  const byPhone = new Map(users.map(u => [u.phone, u]))
  const rows = accounts.map(a => {
    const eff = effectiveVip({ pct: a.manualVipPct, until: a.manualVipUntil }, config.vipEnabled ? a.autoVipPct : 0, now)
    return {
      phone: a.phone, name: byPhone.get(a.phone)?.name ?? null, verified: !!byPhone.get(a.phone)?.phoneVerifiedAt,
      spend: a.autoVipSpend, autoPct: a.autoVipPct, graceUntil: a.autoVipGraceUntil, checkedAt: a.autoVipCheckedAt,
      manualPct: a.manualVipPct, manualUntil: a.manualVipUntil, manualNote: a.manualVipNote, manualBy: a.manualVipByName, manualAt: a.manualVipAt,
      manualActive: manualVipActive({ pct: a.manualVipPct, until: a.manualVipUntil }, now),
      pct: eff.pct, source: eff.source,
    }
  }).filter(r => filter.pct == null || r.pct === filter.pct)
  rows.sort((a, b) => b.pct - a.pct || b.spend - a.spend)
  const counts: Record<number, number> = {}
  for (const r of rows) if (r.pct > 0) counts[r.pct] = (counts[r.pct] ?? 0) + 1
  return { config, rows, counts }
}

// Сарын тайлан (УБ цагаар сар)
export async function monthlyReport(db: Db, cargoId: number, range: { start: Date; end: Date }, now = new Date()) {
  const inMonth = { gte: range.start, lte: range.end }
  const [receiptAgg, receiptsWithLoyalty, adjAgg, adjByReason, ledgerByKind, priceEdits, manualVip, allLedger, settings] = await Promise.all([
    db.handoverReceipt.aggregate({
      where: { cargoId, createdAt: inMonth }, _count: true,
      _sum: { shipmentCount: true, grossMnt: true, discountMnt: true, redeemedPoints: true, redeemedMnt: true, netMnt: true, earnedPoints: true },
    }),
    db.handoverReceipt.groupBy({ by: ['vipPct'], where: { cargoId, createdAt: inMonth }, _count: true, _sum: { grossMnt: true, discountMnt: true } }),
    db.handoverReceiptAdjustment.aggregate({
      where: { cargoId, createdAt: inMonth }, _count: true,
      _sum: { grossDelta: true, discountDelta: true, redeemedPointsDelta: true, redeemedMntDelta: true, netDelta: true, earnedPointsDelta: true },
    }),
    db.handoverReceiptAdjustment.groupBy({ by: ['reason'], where: { cargoId, createdAt: inMonth }, _count: true }),
    db.loyaltyLedger.groupBy({ by: ['kind'], where: { cargoId, createdAt: inMonth }, _sum: { points: true }, _count: true }),
    db.shipmentPriceLog.findMany({
      where: { cargoId, createdAt: inMonth, status: 'PICKED_UP' }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { trackCode: true, oldPrice: true, newPrice: true, actorName: true, createdAt: true, receiptId: true },
    }),
    db.adminAuditLog.findMany({
      where: { cargoId, action: 'loyalty:vip-manual', createdAt: inMonth }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { userName: true, detail: true, createdAt: true },
    }),
    db.loyaltyLedger.findMany({
      where: { cargoId }, select: { id: true, accountId: true, kind: true, points: true, createdAt: true, expiresAt: true, refLedgerId: true },
    }),
    loadConfig(db, cargoId),
  ])
  // Олгоогүй үлдэгдэл = каргоны хэрэглэгчдэд төлөх «өр» (₮-өөр)
  const byAccount = new Map<number, LedgerRow[]>()
  for (const l of allLedger) {
    if (!byAccount.has(l.accountId)) byAccount.set(l.accountId, [])
    byAccount.get(l.accountId)!.push(l)
  }
  let outstanding = 0
  let holders = 0
  for (const rows of byAccount.values()) {
    const s = pointsState(rows, now)
    outstanding += s.available
    if (s.available > 0) holders++
  }
  const s = receiptAgg._sum
  const a = adjAgg._sum
  return {
    receipts: {
      count: receiptAgg._count, shipments: s.shipmentCount ?? 0, grossMnt: s.grossMnt ?? 0, discountMnt: s.discountMnt ?? 0,
      redeemedPoints: s.redeemedPoints ?? 0, redeemedMnt: s.redeemedMnt ?? 0, netMnt: s.netMnt ?? 0, earnedPoints: s.earnedPoints ?? 0,
    },
    byVipPct: receiptsWithLoyalty.map(r => ({ pct: r.vipPct, count: r._count, grossMnt: r._sum.grossMnt ?? 0, discountMnt: r._sum.discountMnt ?? 0 }))
      .sort((x, y) => x.pct - y.pct),
    adjustments: {
      count: adjAgg._count, byReason: Object.fromEntries(adjByReason.map(r => [r.reason, r._count])),
      grossDelta: a.grossDelta ?? 0, discountDelta: a.discountDelta ?? 0, redeemedPointsDelta: a.redeemedPointsDelta ?? 0,
      redeemedMntDelta: a.redeemedMntDelta ?? 0, netDelta: a.netDelta ?? 0, earnedPointsDelta: a.earnedPointsDelta ?? 0,
    },
    ledger: Object.fromEntries(ledgerByKind.map(l => [l.kind, { points: l._sum.points ?? 0, count: l._count }])),
    outstanding: { points: outstanding, valueMnt: outstanding * settings.pointValueMnt, holders },
    priceEditsAfterHandover: priceEdits.map(p => ({ ...p, oldPrice: p.oldPrice == null ? null : Number(p.oldPrice), newPrice: p.newPrice == null ? null : Number(p.newPrice) })),
    manualVipChanges: manualVip,
    skipReasonLabel: SKIP_REASON_LABEL,
  }
}

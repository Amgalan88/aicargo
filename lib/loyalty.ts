// Урамшууллын DB давхарга. Бүх query cargoId-оор хязгаарлагдана (tenant тусгаарлалт — lib/loyalty.db.test.ts).
// Олголт = нэг транзакц: ачааг түгжээд PICKED_UP болгох, баримт (HandoverReceipt), онооны дэвтэр.
import { Prisma, PrismaClient } from '@prisma/client'
import {
  DAY_MS, autoVip, configFromRow, effectiveVip, manualVipPct, ownerPhoneOf, priceChangeCompensation, quoteReceipt,
  RedeemError, simulatePoints, toCents, fromCents, ubMonthRange,
  type AutoVip, type LedgerEntry, type LoyaltyConfig, type PointsState, type Quote, type SpendEvent,
} from './loyalty-core'

export type Db = PrismaClient | Prisma.TransactionClient

export interface Actor { id: number; name: string; phone: string | null }

export class LoyaltyError extends Error {
  constructor(message: string, readonly status = 409, readonly details?: unknown) { super(message) }
}

// ── Тохиргоо ─────────────────────────────────────────────────────────────────

export async function getLoyaltyConfig(db: Db, cargoId: number): Promise<LoyaltyConfig> {
  const row = await db.loyaltySettings.findUnique({ where: { cargoId } })
  return configFromRow(row as never)
}

export async function saveLoyaltyConfig(db: Db, cargoId: number, cfg: LoyaltyConfig, actor: Actor) {
  const data = {
    pointsEnabled: cfg.pointsEnabled, vipEnabled: cfg.vipEnabled,
    earnMntPerPoint: cfg.earnMntPerPoint, pointValueMnt: cfg.pointValueMnt, pointsExpiryDays: cfg.pointsExpiryDays,
    maxRedeemPct: cfg.maxRedeemPct, vipWindowDays: cfg.vipWindowDays, vipGraceDays: cfg.vipGraceDays,
    vipTiers: cfg.vipTiers as unknown as Prisma.InputJsonValue,
    updatedById: actor.id, updatedByName: actor.name,
  }
  await db.loyaltySettings.upsert({ where: { cargoId }, update: data, create: { cargoId, ...data } })
}

export const loyaltyOn = (cfg: LoyaltyConfig) => cfg.pointsEnabled || cfg.vipEnabled

// ── Хэрэглэгчийн төлөв ───────────────────────────────────────────────────────

// Олголтын огноо: баримттай бол баримтын огноо, хуучин (баримтгүй) олголтод updatedAt (одоогийн тайлантай ижил)
export async function loadSpendEvents(db: Db, cargoId: number, phones: string[] | null, since: Date): Promise<Map<string, SpendEvent[]>> {
  const rows = phones
    ? await db.$queryRaw<{ phone: string; at: Date; amount: Prisma.Decimal | null }[]>`
        SELECT COALESCE(NULLIF(TRIM(s.phone), ''), u.phone) AS phone, COALESCE(r."createdAt", s."updatedAt") AS at, s."adminPrice" AS amount
        FROM "Shipment" s
        LEFT JOIN "HandoverReceipt" r ON r.id = s."receiptId" AND r."cargoId" = s."cargoId"
        LEFT JOIN "User" u ON u.id = s."userId"
        WHERE s."cargoId" = ${cargoId} AND s.status = 'PICKED_UP' AND s."adminPrice" IS NOT NULL
          AND (TRIM(s.phone) = ANY(${phones}::text[]) OR (NULLIF(TRIM(s.phone), '') IS NULL AND u.phone = ANY(${phones}::text[])))
          AND COALESCE(r."createdAt", s."updatedAt") >= ${since}`
    : await db.$queryRaw<{ phone: string; at: Date; amount: Prisma.Decimal | null }[]>`
        SELECT COALESCE(NULLIF(TRIM(s.phone), ''), u.phone) AS phone, COALESCE(r."createdAt", s."updatedAt") AS at, s."adminPrice" AS amount
        FROM "Shipment" s
        LEFT JOIN "HandoverReceipt" r ON r.id = s."receiptId" AND r."cargoId" = s."cargoId"
        LEFT JOIN "User" u ON u.id = s."userId"
        WHERE s."cargoId" = ${cargoId} AND s.status = 'PICKED_UP' AND s."adminPrice" IS NOT NULL
          AND COALESCE(r."createdAt", s."updatedAt") >= ${since}`
  const out = new Map<string, SpendEvent[]>()
  for (const r of rows) {
    if (!r.phone) continue
    const list = out.get(r.phone) ?? []
    list.push({ at: new Date(r.at), amount: Number(r.amount ?? 0) })
    out.set(r.phone, list)
  }
  return out
}

const ACCOUNT_SELECT = {
  id: true, phone: true, vipManualPct: true, vipManualNote: true, vipManualUntil: true, vipManualByName: true, vipManualAt: true,
  ledger: { select: { id: true, kind: true, points: true, createdAt: true, expiresAt: true, refLedgerId: true } },
} as const

export interface CustomerState {
  phone: string
  accountId: number | null
  manual: { pct: number | null; note: string | null; until: Date | null; by: string | null; at: Date | null }
  manualPct: number          // одоо хүчинтэй гараар оноосон %
  auto: AutoVip
  vip: { pct: number; source: 'AUTO' | 'MANUAL' | null }
  points: PointsState
  user: { id: number; name: string; verified: boolean } | null
  canRedeem: boolean
}

export async function loadCustomerStates(db: Db, cargoId: number, cfg: LoyaltyConfig, phones: string[], now: Date): Promise<Map<string, CustomerState>> {
  const uniq = [...new Set(phones.filter(Boolean))]
  const out = new Map<string, CustomerState>()
  if (!uniq.length) return out
  const since = new Date(now.getTime() - (cfg.vipWindowDays + cfg.vipGraceDays) * DAY_MS)
  const [events, accounts, users] = await Promise.all([
    loadSpendEvents(db, cargoId, uniq, since),
    db.loyaltyAccount.findMany({ where: { cargoId, phone: { in: uniq } }, select: ACCOUNT_SELECT }),
    // Утас бүх системд unique — гэхдээ зөвхөн ЭНЭ каргоны хэрэглэгч оноо зарцуулна
    db.user.findMany({ where: { cargoId, phone: { in: uniq } }, select: { id: true, name: true, phone: true, role: true, phoneVerifiedAt: true } }),
  ])
  const accByPhone = new Map(accounts.map(a => [a.phone, a]))
  const userByPhone = new Map(users.map(u => [u.phone, u]))
  for (const phone of uniq) {
    const acc = accByPhone.get(phone)
    const u = userByPhone.get(phone)
    const auto = autoVip(events.get(phone) ?? [], now, cfg)
    const manualPct = manualVipPct(acc ? { vipManualPct: acc.vipManualPct, vipManualUntil: acc.vipManualUntil } : null, now)
    const points = simulatePoints((acc?.ledger ?? []) as LedgerEntry[], now)
    const verified = !!u?.phoneVerifiedAt
    out.set(phone, {
      phone,
      accountId: acc?.id ?? null,
      manual: { pct: acc?.vipManualPct ?? null, note: acc?.vipManualNote ?? null, until: acc?.vipManualUntil ?? null, by: acc?.vipManualByName ?? null, at: acc?.vipManualAt ?? null },
      manualPct,
      auto,
      vip: effectiveVip(auto, manualPct),
      points,
      user: u ? { id: u.id, name: u.name, verified } : null,
      canRedeem: !!u && u.role === 'USER' && verified,
    })
  }
  return out
}

// ── Олголт ───────────────────────────────────────────────────────────────────

interface LockedShipment { id: number; trackCode: string; adminPrice: Prisma.Decimal | null; phone: string | null; userId: number | null; userPhone: string | null }

export interface GroupQuote {
  ownerKey: string
  phone: string | null
  shipmentIds: number[]
  itemCount: number
  applyLoyalty: boolean
  loyaltyNote: string | null
  quote: Quote
  redeemError: string | null
  customer: {
    name: string | null; registered: boolean; verified: boolean; canRedeem: boolean
    pointsBalance: number; vipPct: number; vipSource: 'AUTO' | 'MANUAL' | null; autoPct: number; manualPct: number; spend: number
  } | null
}

function groupShipments(rows: LockedShipment[]) {
  const groups = new Map<string, LockedShipment[]>()
  for (const r of rows) {
    const key = ownerPhoneOf({ phone: r.phone, user: { phone: r.userPhone } }) ?? ''
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function buildQuotes(
  rows: LockedShipment[], cfg: LoyaltyConfig, states: Map<string, CustomerState>, actor: Actor,
  redeem: Record<string, number>, strict: boolean,
): GroupQuote[] {
  return groupShipments(rows).map(([ownerKey, items]) => {
    const phone = ownerKey || null
    const st = phone ? states.get(phone) : undefined
    const self = !!phone && !!actor.phone && phone === actor.phone
    const applyLoyalty = !!phone && loyaltyOn(cfg) && !self
    const gross = fromCents(items.reduce((s, r) => s + toCents(r.adminPrice), 0))
    const input = {
      grossMnt: gross, cfg, applyLoyalty,
      vip: st?.vip ?? { pct: 0, source: null },
      pointsBalance: st?.points.balance ?? 0,
      canRedeem: st?.canRedeem ?? false,
      redeemPoints: phone ? Number(redeem[phone] ?? 0) : 0,
    }
    let quote: Quote
    let redeemError: string | null = null
    try {
      quote = quoteReceipt(input)
    } catch (e) {
      if (!(e instanceof RedeemError)) throw e
      if (strict) throw new LoyaltyError(`${phone}: ${e.message}`, 409, { phone, maxRedeemPoints: e.maxRedeemPoints })
      redeemError = e.message
      quote = quoteReceipt({ ...input, redeemPoints: 0 })
    }
    return {
      ownerKey, phone, shipmentIds: items.map(i => i.id), itemCount: items.length,
      applyLoyalty, loyaltyNote: self && loyaltyOn(cfg) ? 'self' : null,
      quote, redeemError,
      customer: st ? {
        name: st.user?.name ?? null, registered: !!st.user, verified: st.user?.verified ?? false, canRedeem: st.canRedeem,
        pointsBalance: st.points.balance, vipPct: st.vip.pct, vipSource: st.vip.source,
        autoPct: st.auto.pct, manualPct: st.manualPct, spend: st.auto.spend,
      } : null,
    }
  })
}

async function readShipments(db: Db, cargoId: number, ids: number[], lock: boolean): Promise<LockedShipment[]> {
  if (!ids.length) return []
  return lock
    ? db.$queryRaw<LockedShipment[]>`
        SELECT s.id, s."trackCode", s."adminPrice", s.phone, s."userId", u.phone AS "userPhone"
        FROM "Shipment" s LEFT JOIN "User" u ON u.id = s."userId"
        WHERE s."cargoId" = ${cargoId} AND s.id = ANY(${ids}::int[]) AND s.status = 'ARRIVED'
        ORDER BY s.id FOR UPDATE OF s`
    : db.$queryRaw<LockedShipment[]>`
        SELECT s.id, s."trackCode", s."adminPrice", s.phone, s."userId", u.phone AS "userPhone"
        FROM "Shipment" s LEFT JOIN "User" u ON u.id = s."userId"
        WHERE s."cargoId" = ${cargoId} AND s.id = ANY(${ids}::int[]) AND s.status = 'ARRIVED'
        ORDER BY s.id`
}

export function cleanIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map(Number).filter(n => Number.isInteger(n) && n > 0))]
}

export function cleanRedeem(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v)
    if (k && n !== 0) out[k] = n
  }
  return out
}

// Урьдчилсан тооцоо (бичихгүй) — «Олгох» хуудас
export async function quoteHandover(db: Db, args: { cargoId: number; actor: Actor; shipmentIds: number[]; redeem?: Record<string, number>; now?: Date }) {
  const now = args.now ?? new Date()
  const cfg = await getLoyaltyConfig(db, args.cargoId)
  const rows = await readShipments(db, args.cargoId, args.shipmentIds, false)
  const phones = groupShipments(rows).map(([k]) => k).filter(Boolean)
  const states = loyaltyOn(cfg) ? await loadCustomerStates(db, args.cargoId, cfg, phones, now) : new Map()
  return { enabled: { points: cfg.pointsEnabled, vip: cfg.vipEnabled }, pointValueMnt: cfg.pointValueMnt, groups: buildQuotes(rows, cfg, states, args.actor, args.redeem ?? {}, false) }
}

export interface ReceiptSummary {
  id: number; phone: string | null; itemCount: number; grossMnt: number; vipPct: number; vipDiscountMnt: number
  pointsRedeemed: number; pointsRedeemedMnt: number; netMnt: number; pointsEarned: number; loyaltyNote: string | null
}

const RECEIPT_SUMMARY = {
  id: true, phone: true, itemCount: true, grossMnt: true, vipPct: true, vipDiscountMnt: true,
  pointsRedeemed: true, pointsRedeemedMnt: true, netMnt: true, pointsEarned: true, loyaltyNote: true,
} as const

function toSummary(r: { id: number; phone: string | null; itemCount: number; grossMnt: Prisma.Decimal; vipPct: number; vipDiscountMnt: Prisma.Decimal; pointsRedeemed: number; pointsRedeemedMnt: Prisma.Decimal; netMnt: Prisma.Decimal; pointsEarned: number; loyaltyNote: string | null }): ReceiptSummary {
  return {
    ...r, grossMnt: Number(r.grossMnt), vipDiscountMnt: Number(r.vipDiscountMnt),
    pointsRedeemedMnt: Number(r.pointsRedeemedMnt), netMnt: Number(r.netMnt),
  }
}

async function replay(db: Db, cargoId: number, requestKey: string) {
  const existing = await db.handoverReceipt.findMany({ where: { cargoId, requestKey }, select: RECEIPT_SUMMARY, orderBy: { id: 'asc' } })
  return existing.length
    ? { count: existing.reduce((s, r) => s + r.itemCount, 0), receipts: existing.map(toSummary), replayed: true }
    : null
}

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
    || (e as { code?: string })?.code === 'P2002'
    || /unique constraint|23505/i.test(String((e as Error)?.message ?? ''))
}

// «Олгох». requestKey нь нэг товч даралт — дахин илгээхэд (сүлжээ тасрах г.м.) шинэ баримт, оноо үүсэхгүй.
export async function performHandover(db: PrismaClient, args: {
  cargoId: number; actor: Actor; shipmentIds: number[]; requestKey: string
  redeem?: Record<string, number>; expectedNet?: Record<string, number>; now?: Date
}): Promise<{ count: number; receipts: ReceiptSummary[]; replayed: boolean }> {
  const { cargoId, actor, requestKey } = args
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestKey)) throw new LoyaltyError('requestKey буруу', 400)
  const first = await replay(db, cargoId, requestKey)
  if (first) return first
  try {
    return await db.$transaction(async tx => {
      const now = args.now ?? new Date()
      const again = await replay(tx, cargoId, requestKey)
      if (again) return again
      const rows = await readShipments(tx, cargoId, args.shipmentIds, true)
      if (!rows.length) {
        // Ижил requestKey-тэй зэрэгцээ хүсэлт түрүүлж дууссан бол (түгжээ суларсны дараа) түүний баримтыг буцаана
        return (await replay(tx, cargoId, requestKey)) ?? { count: 0, receipts: [], replayed: false }
      }
      const cfg = await getLoyaltyConfig(tx, cargoId)
      const phones = groupShipments(rows).map(([k]) => k).filter(Boolean)
      let states = new Map<string, CustomerState>()
      if (loyaltyOn(cfg) && phones.length) {
        // Данс үүсгээд түгжинэ (ижил хэрэглэгчид зэрэг олголт хийхэд оноо давхар зарцуулагдахгүй)
        if (cfg.pointsEnabled) {
          await tx.$executeRaw`
            INSERT INTO "LoyaltyAccount" ("cargoId", phone, "createdAt", "updatedAt")
            SELECT ${cargoId}, p, ${now}, ${now} FROM unnest(${phones}::text[]) AS p
            ON CONFLICT ("cargoId", phone) DO NOTHING`
        }
        await tx.$queryRaw`SELECT id FROM "LoyaltyAccount" WHERE "cargoId" = ${cargoId} AND phone = ANY(${phones}::text[]) ORDER BY phone FOR UPDATE`
        states = await loadCustomerStates(tx, cargoId, cfg, phones, now)
      }
      const groups = buildQuotes(rows, cfg, states, actor, args.redeem ?? {}, true)
      const byId = new Map(rows.map(r => [r.id, r]))
      const receipts: ReceiptSummary[] = []
      for (const g of groups) {
        const expected = args.expectedNet?.[g.ownerKey]
        if (expected !== undefined && toCents(expected) !== toCents(g.quote.netMnt)) {
          throw new LoyaltyError('Төлөх дүн өөрчлөгдсөн байна — дахин шалгаад олгоно уу', 409, { ownerKey: g.ownerKey, netMnt: g.quote.netMnt })
        }
        const st = g.phone ? states.get(g.phone) : undefined
        const q = g.quote
        const receipt = await tx.handoverReceipt.create({
          data: {
            cargoId, requestKey, ownerKey: g.ownerKey, phone: g.phone, userId: st?.user?.id ?? null,
            itemCount: g.itemCount,
            items: g.shipmentIds.map(id => ({ id, trackCode: byId.get(id)!.trackCode, price: byId.get(id)!.adminPrice == null ? null : Number(byId.get(id)!.adminPrice) })),
            grossMnt: q.grossMnt,
            vipEnabled: g.applyLoyalty && cfg.vipEnabled, vipPct: q.vipPct, vipSource: q.vipSource, vipDiscountMnt: q.vipDiscountMnt,
            pointsEnabled: g.applyLoyalty && cfg.pointsEnabled, pointsRedeemed: q.pointsRedeemed, pointsRedeemedMnt: q.pointsRedeemedMnt,
            pointsEarned: q.pointsEarned,
            earnMntPerPoint: g.applyLoyalty && cfg.pointsEnabled ? cfg.earnMntPerPoint : null,
            pointValueMnt: g.applyLoyalty && cfg.pointsEnabled ? cfg.pointValueMnt : null,
            netMnt: q.netMnt, loyaltyNote: g.loyaltyNote,
            createdById: actor.id, createdByName: actor.name, createdAt: now,
          },
          select: RECEIPT_SUMMARY,
        })
        const { count } = await tx.shipment.updateMany({
          where: { id: { in: g.shipmentIds }, cargoId, status: 'ARRIVED' },
          data: { status: 'PICKED_UP', receiptId: receipt.id },
        })
        if (count !== g.itemCount) throw new LoyaltyError('Ачааны төлөв зэрэг өөрчлөгдсөн — дахин оролдоно уу', 409)

        if (g.applyLoyalty && cfg.pointsEnabled && st && g.phone) {
          const acc = await tx.loyaltyAccount.findUniqueOrThrow({ where: { cargoId_phone: { cargoId, phone: g.phone } }, select: { id: true } })
          const base = { cargoId, accountId: acc.id, actorId: actor.id, actorName: actor.name, createdAt: now }
          for (const d of st.points.dueExpiries) {
            await tx.loyaltyLedger.create({ data: { ...base, kind: 'EXPIRE', points: -d.points, refLedgerId: d.lotId, dedupeKey: `expire:l${d.lotId}`, note: 'Хугацаа дууссан' } })
          }
          if (q.pointsRedeemed > 0) {
            await tx.loyaltyLedger.create({ data: { ...base, kind: 'REDEEM', points: -q.pointsRedeemed, receiptId: receipt.id, dedupeKey: `redeem:r${receipt.id}` } })
          }
          if (q.pointsEarned > 0) {
            await tx.loyaltyLedger.create({
              data: { ...base, kind: 'EARN', points: q.pointsEarned, receiptId: receipt.id, dedupeKey: `earn:r${receipt.id}`, expiresAt: new Date(now.getTime() + cfg.pointsExpiryDays * DAY_MS) },
            })
          }
        }
        receipts.push(toSummary(receipt))
      }
      return { count: receipts.reduce((s, r) => s + r.itemCount, 0), receipts, replayed: false }
    }, { timeout: 20_000, maxWait: 10_000 })
  } catch (e) {
    // Ижил requestKey зэрэг ирвэл нэг нь л баримт үүсгэнэ — нөгөө нь түүнийг буцаана
    if (isUniqueViolation(e)) {
      const r = await replay(db, cargoId, requestKey)
      if (r) return r
    }
    throw e
  }
}

// ── Үнэ засах ────────────────────────────────────────────────────────────────

// adminPrice өөрчлөлт бүрийг бичнэ. Олгосон ачаа бол баримтын нөхцөлөөр дахин бодож онооны зөрүүг ADJUST мөрөөр нэмнэ.
// Баримт болон дэвтрийн хуучин мөрийг хэзээ ч өөрчлөхгүй. Дуудагч нь транзакц дотор, ачааг түгжсэний дараа дуудна.
export async function recordPriceChange(tx: Prisma.TransactionClient, args: {
  cargoId: number; actor: Actor; shipment: { id: number; trackCode: string; status: string; adminPrice: Prisma.Decimal | number | null; receiptId: number | null }
  newPrice: number | null; now?: Date
}) {
  const { cargoId, actor, shipment } = args
  const now = args.now ?? new Date()
  const oldC = shipment.adminPrice == null ? null : toCents(shipment.adminPrice)
  const newC = args.newPrice == null ? null : toCents(args.newPrice)
  if (oldC === newC) return null
  let vipDiscountDeltaMnt = 0, pointsDelta = 0
  let receipt: { id: number; phone: string | null; grossMnt: Prisma.Decimal; vipEnabled: boolean; vipPct: number; pointsEnabled: boolean; earnMntPerPoint: number | null; pointsRedeemedMnt: Prisma.Decimal; pointsEarned: number; createdAt: Date } | null = null
  if (shipment.status === 'PICKED_UP' && shipment.receiptId) {
    await tx.$queryRaw`SELECT id FROM "HandoverReceipt" WHERE id = ${shipment.receiptId} AND "cargoId" = ${cargoId} FOR UPDATE`
    receipt = await tx.handoverReceipt.findFirst({
      where: { id: shipment.receiptId, cargoId },
      select: { id: true, phone: true, grossMnt: true, vipEnabled: true, vipPct: true, pointsEnabled: true, earnMntPerPoint: true, pointsRedeemedMnt: true, pointsEarned: true, createdAt: true },
    })
  }
  if (receipt) {
    const prior = await tx.shipmentPriceChange.findMany({ where: { cargoId, receiptId: receipt.id }, select: { oldPrice: true, newPrice: true } })
    const prevGrossC = toCents(receipt.grossMnt) + prior.reduce((s, p) => s + toCents(p.newPrice) - toCents(p.oldPrice), 0)
    const newGrossC = prevGrossC + (newC ?? 0) - (oldC ?? 0)
    const adj = await tx.loyaltyLedger.aggregate({ where: { cargoId, receiptId: receipt.id, kind: 'ADJUST' }, _sum: { points: true } })
    const comp = priceChangeCompensation(
      { vipEnabled: receipt.vipEnabled, vipPct: receipt.vipPct, pointsEnabled: receipt.pointsEnabled, earnMntPerPoint: receipt.earnMntPerPoint, pointsRedeemedMnt: Number(receipt.pointsRedeemedMnt) },
      fromCents(prevGrossC), fromCents(newGrossC), receipt.pointsEarned + (adj._sum.points ?? 0),
    )
    vipDiscountDeltaMnt = comp.vipDiscountDeltaMnt
    pointsDelta = receipt.pointsEnabled && receipt.phone ? comp.pointsDelta : 0
  }
  const change = await tx.shipmentPriceChange.create({
    data: {
      cargoId, shipmentId: shipment.id, trackCode: shipment.trackCode, status: shipment.status as never,
      oldPrice: oldC == null ? null : fromCents(oldC), newPrice: newC == null ? null : fromCents(newC),
      receiptId: receipt?.id ?? null, vipDiscountDeltaMnt, pointsDelta, actorId: actor.id, actorName: actor.name, createdAt: now,
    },
  })
  if (receipt && pointsDelta !== 0 && receipt.phone) {
    const cfg = await getLoyaltyConfig(tx, cargoId)
    await tx.$executeRaw`
      INSERT INTO "LoyaltyAccount" ("cargoId", phone, "createdAt", "updatedAt") VALUES (${cargoId}, ${receipt.phone}, ${now}, ${now})
      ON CONFLICT ("cargoId", phone) DO NOTHING`
    const [acc] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "LoyaltyAccount" WHERE "cargoId" = ${cargoId} AND phone = ${receipt.phone} FOR UPDATE`
    await tx.loyaltyLedger.create({
      data: {
        cargoId, accountId: acc.id, kind: 'ADJUST', points: pointsDelta, receiptId: receipt.id, priceChangeId: change.id,
        dedupeKey: `adj:pc${change.id}`, actorId: actor.id, actorName: actor.name, createdAt: now,
        expiresAt: pointsDelta > 0 ? new Date(receipt.createdAt.getTime() + cfg.pointsExpiryDays * DAY_MS) : null,
        note: `${shipment.trackCode}: үнэ ${oldC == null ? '—' : fromCents(oldC)} → ${newC == null ? '—' : fromCents(newC)}`,
      },
    })
  }
  return { id: change.id, vipDiscountDeltaMnt, pointsDelta }
}

// ── Админ: VIP жагсаалт, гараар оноох ───────────────────────────────────────

export interface VipRow {
  phone: string; name: string | null; registered: boolean; verified: boolean
  spend: number; autoPct: number; held: boolean; manualPct: number | null; manualActivePct: number; manualNote: string | null
  manualUntil: Date | null; manualBy: string | null; effectivePct: number; source: 'AUTO' | 'MANUAL' | null; pointsBalance: number
}

export async function listLoyaltyCustomers(db: Db, cargoId: number, cfg: LoyaltyConfig, now: Date, opts: { q?: string } = {}): Promise<VipRow[]> {
  const since = new Date(now.getTime() - (cfg.vipWindowDays + cfg.vipGraceDays) * DAY_MS)
  const events = await loadSpendEvents(db, cargoId, null, since)
  const candidates = new Set<string>()
  for (const [phone, ev] of events) if (autoVip(ev, now, cfg).pct > 0) candidates.add(phone)
  const accounts = await db.loyaltyAccount.findMany({
    where: { cargoId, OR: [{ vipManualPct: { not: null } }, { ledger: { some: {} } }] }, select: { phone: true },
  })
  for (const a of accounts) candidates.add(a.phone)
  const q = opts.q?.replace(/\D/g, '')
  const phones = [...candidates].filter(p => !q || p.includes(q))
  if (q && /^\d{8}$/.test(q)) phones.push(q)
  const states = await loadCustomerStates(db, cargoId, cfg, phones, now)
  const rows: VipRow[] = [...states.values()].map(s => ({
    phone: s.phone, name: s.user?.name ?? null, registered: !!s.user, verified: s.user?.verified ?? false,
    spend: s.auto.spend, autoPct: s.auto.pct, held: s.auto.held, manualPct: s.manual.pct, manualActivePct: s.manualPct,
    manualNote: s.manual.note, manualUntil: s.manual.until, manualBy: s.manual.by,
    effectivePct: s.vip.pct, source: s.vip.source, pointsBalance: s.points.balance,
  }))
  return rows.sort((a, b) => b.effectivePct - a.effectivePct || b.spend - a.spend || a.phone.localeCompare(b.phone))
}

export async function setManualVip(db: Db, cargoId: number, phone: string, input: { pct: number | null; note: string | null; until: Date | null }, actor: Actor, now = new Date()) {
  const data = input.pct
    ? { vipManualPct: input.pct, vipManualNote: input.note, vipManualUntil: input.until, vipManualById: actor.id, vipManualByName: actor.name, vipManualAt: now }
    : { vipManualPct: null, vipManualNote: input.note, vipManualUntil: null, vipManualById: actor.id, vipManualByName: actor.name, vipManualAt: now }
  return db.loyaltyAccount.upsert({
    where: { cargoId_phone: { cargoId, phone } },
    update: data,
    create: { cargoId, phone, ...data },
    select: { id: true, phone: true, vipManualPct: true, vipManualNote: true, vipManualUntil: true },
  })
}

// ── Хэрэглэгч, тайлан ────────────────────────────────────────────────────────

export async function customerLoyalty(db: Db, cargoId: number, phone: string, now = new Date()) {
  const cfg = await getLoyaltyConfig(db, cargoId)
  if (!loyaltyOn(cfg)) return null
  const st = (await loadCustomerStates(db, cargoId, cfg, [phone], now)).get(phone)!
  const receipts = await db.handoverReceipt.findMany({
    where: { cargoId, phone }, orderBy: { createdAt: 'desc' }, take: 10,
    select: { ...RECEIPT_SUMMARY, createdAt: true },
  })
  return {
    points: cfg.pointsEnabled ? {
      balance: Math.max(0, st.points.balance), valueMnt: Math.max(0, st.points.balance) * cfg.pointValueMnt,
      pointValueMnt: cfg.pointValueMnt, earnMntPerPoint: cfg.earnMntPerPoint, maxRedeemPct: cfg.maxRedeemPct, expiryDays: cfg.pointsExpiryDays,
      expiringSoon: st.points.expiringSoon, canRedeem: st.canRedeem,
    } : null,
    vip: cfg.vipEnabled ? {
      pct: st.vip.pct, source: st.vip.source, spend: st.auto.spend, held: st.auto.held, next: st.auto.next,
      windowDays: cfg.vipWindowDays, tiers: cfg.vipTiers, manualUntil: st.vip.source === 'MANUAL' ? st.manual.until : null,
    } : null,
    receipts: receipts.map(r => ({ ...toSummary(r), createdAt: r.createdAt })),
  }
}

export async function monthlyReport(db: Db, cargoId: number, month: string, now = new Date()) {
  const range = ubMonthRange(month)
  if (!range) throw new LoyaltyError('Сар буруу (YYYY-MM)', 400)
  const inMonth = { gte: range.start, lte: range.end }
  const cfg = await getLoyaltyConfig(db, cargoId)
  const [rc, vipCount, ledger, adjustUp, adjustDown, priceChanges, manualChanges, allLedger] = await Promise.all([
    db.handoverReceipt.aggregate({
      where: { cargoId, createdAt: inMonth },
      _count: { _all: true },
      _sum: { grossMnt: true, vipDiscountMnt: true, pointsRedeemed: true, pointsRedeemedMnt: true, pointsEarned: true, netMnt: true, itemCount: true },
    }),
    db.handoverReceipt.count({ where: { cargoId, createdAt: inMonth, vipPct: { gt: 0 } } }),
    db.loyaltyLedger.groupBy({ by: ['kind'], where: { cargoId, createdAt: inMonth }, _sum: { points: true }, _count: { _all: true } }),
    db.loyaltyLedger.aggregate({ where: { cargoId, createdAt: inMonth, kind: 'ADJUST', points: { gt: 0 } }, _sum: { points: true } }),
    db.loyaltyLedger.aggregate({ where: { cargoId, createdAt: inMonth, kind: 'ADJUST', points: { lt: 0 } }, _sum: { points: true } }),
    db.shipmentPriceChange.aggregate({ where: { cargoId, createdAt: inMonth, receiptId: { not: null } }, _count: { _all: true }, _sum: { vipDiscountDeltaMnt: true, pointsDelta: true } }),
    db.loyaltyAccount.count({ where: { cargoId, vipManualAt: inMonth } }),
    db.loyaltyLedger.findMany({ where: { cargoId }, select: { accountId: true, id: true, kind: true, points: true, createdAt: true, expiresAt: true, refLedgerId: true } }),
  ])
  const byKind = Object.fromEntries(ledger.map(l => [l.kind, { points: l._sum.points ?? 0, count: l._count._all }]))
  // Нийт үлдэгдэл (каргоны өр) — одоогийн байдлаар
  const perAccount = new Map<number, LedgerEntry[]>()
  for (const e of allLedger) perAccount.set(e.accountId, [...(perAccount.get(e.accountId) ?? []), e])
  let outstanding = 0
  for (const list of perAccount.values()) outstanding += Math.max(0, simulatePoints(list, now).balance)
  const vipRows = cfg.vipEnabled ? await listLoyaltyCustomers(db, cargoId, cfg, now) : []
  const tiers: Record<string, number> = {}
  for (const r of vipRows) if (r.effectivePct > 0) tiers[r.effectivePct] = (tiers[r.effectivePct] ?? 0) + 1
  return {
    month, enabled: { points: cfg.pointsEnabled, vip: cfg.vipEnabled },
    receipts: {
      count: rc._count._all, items: rc._sum.itemCount ?? 0, grossMnt: Number(rc._sum.grossMnt ?? 0), netMnt: Number(rc._sum.netMnt ?? 0),
      vipReceipts: vipCount, vipDiscountMnt: Number(rc._sum.vipDiscountMnt ?? 0),
      pointsRedeemed: rc._sum.pointsRedeemed ?? 0, pointsRedeemedMnt: Number(rc._sum.pointsRedeemedMnt ?? 0), pointsEarned: rc._sum.pointsEarned ?? 0,
    },
    ledger: {
      earned: byKind.EARN?.points ?? 0, redeemed: -(byKind.REDEEM?.points ?? 0), expired: -(byKind.EXPIRE?.points ?? 0),
      adjustedUp: adjustUp._sum.points ?? 0, adjustedDown: -(adjustDown._sum.points ?? 0),
    },
    priceEditsAfterHandover: {
      count: priceChanges._count._all, vipDiscountDeltaMnt: Number(priceChanges._sum.vipDiscountDeltaMnt ?? 0), pointsDelta: priceChanges._sum.pointsDelta ?? 0,
    },
    manualVipChanges: manualChanges,
    outstandingPoints: outstanding, outstandingMnt: outstanding * cfg.pointValueMnt,
    vipTiersNow: tiers,
  }
}

// Демо каргог өдөр бүр цэвэрлэхэд л (lib/demo-seed) — дэвтрийн append-only trigger-ийг энэ транзакцад л зөвшөөрнө
export async function purgeLoyaltyForDemo(db: PrismaClient, cargoId: number) {
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('aicargo.loyalty_purge', 'on', true)`
    await tx.loyaltyLedger.deleteMany({ where: { cargoId } })
    await tx.shipmentPriceChange.deleteMany({ where: { cargoId } })
    await tx.shipment.updateMany({ where: { cargoId, receiptId: { not: null } }, data: { receiptId: null } })
    await tx.handoverReceipt.deleteMany({ where: { cargoId } })
    await tx.loyaltyAccount.deleteMany({ where: { cargoId } })
    await tx.loyaltySettings.deleteMany({ where: { cargoId } })
  })
}

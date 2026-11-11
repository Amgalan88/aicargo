import { NextRequest, NextResponse, after } from 'next/server'
import type { Prisma } from '@prisma/client'
import { recordPriceChange } from '@/lib/loyalty'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { checkCrossCargoOnImport } from '@/lib/notifications'
import { logAdminAction, auditLater } from '@/lib/audit'
import { notifyArrivedForCargo } from '@/lib/push'
import { parseArrivedCode } from '@/lib/track-code'
import { parsePhone } from '@/lib/phone'
import { resolveImportOwners } from '@/lib/import-owner'
import { ubDayRange } from '@/lib/ub-date'
import { importLimitError } from '@/lib/import-limits'
import { openDispatchId, markArrivals } from '@/lib/dispatch'
import { recordDeletions, DELETION_SNAPSHOT_SELECT, createdWithArrival } from '@/lib/shipment-deletion'
import { scanArrival, ArrivalScanConflictError, ARRIVED_OR_LATER, parseScanPrice, partitionArrivalImport } from '@/lib/arrival-scan'

// Excel-ээс олон зуун мөр орж ирж болдог тул мөр мөрөөр DB руу хандвал
// round-trip хэтэрч timeout болно (batch feature дээр олдсонтой ижил алдаа) —
// доор бүх мөрийг НЭГ bulk upsert query-гээр бичнэ.
export const maxDuration = 60

export async function PUT(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const body = await req.json()
  const rows: { trackCode: string; phone?: string; price?: number }[] = body.rows
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'Өгөгдөл хоосон' }, { status: 400 })
  }
  const cargoId = admin.cargoId!

  // Нэг импортод ижил код давхар орвол сүүлийнх нь дийлдэнэ (bulk upsert нэг
  // conflict target-ийг хоёр удаа хөндөж чадахгүй тул урьдчилан dedupe хийнэ)
  const rowByCode = new Map<string, { trackCode: string; phone?: string; price?: number }>()
  const notCodes: string[] = []
  for (const r of rows) {
    const c = parseArrivedCode(r.trackCode)
    if (c) rowByCode.set(c, { ...r, trackCode: c })
    else notCodes.push(String(r.trackCode ?? '').slice(0, 40))
  }
  const codes = Array.from(rowByCode.keys())
  if (!codes.length) return NextResponse.json({ error: 'Трак код олдсонгүй', notCodes: notCodes.slice(0, 10) }, { status: 400 })

  const existingRows = await prisma.shipment.findMany({
    where: { cargoId, trackCode: { in: codes } },
    include: { user: { select: { phone: true } } },
  })
  const existingByCode = new Map(existingRows.map(s => [s.trackCode, s]))
  const limitError = await importLimitError(cargoId, rows.length, codes.length - existingRows.length)
  if (limitError) return NextResponse.json({ error: limitError }, { status: 429 })

  // Эзэн: Excel-ийн утас давуу (lib/import-owner)
  const { phones, userIds, changes } = await resolveImportOwners(
    cargoId, codes, new Map(codes.map(c => [c, rowByCode.get(c)!.phone])), existingByCode,
  )
  // Олгогдсон ачааг хөндөхгүй тул эзэн нь ч солигдохгүй
  const ownerChanges = changes.filter(x => existingByCode.get(x.trackCode)?.status !== 'PICKED_UP')
  const duplicateRows = rows.length - notCodes.length - codes.length
  const { fresh, alreadyArrived, pickedUp } = partitionArrivalImport(codes, existingByCode)

  const now = new Date()
  const idx = new Map(codes.map((c, i) => [c, i]))
  if (fresh.length) {
    const prices = fresh.map(c => parseScanPrice(rowByCode.get(c)!.price) ?? null)
    await prisma.$executeRaw`
      INSERT INTO "Shipment" ("trackCode", status, "arrivedAt", "adminPrice", phone, "cargoId", "userId", "createdAt", "updatedAt")
      SELECT t.code, 'ARRIVED'::"Status", ${now}, t.price, t.phone, ${cargoId}, t.userId, ${now}, ${now}
      FROM unnest(${fresh}::text[], ${prices}::numeric[], ${fresh.map(c => phones[idx.get(c)!])}::text[], ${fresh.map(c => userIds[idx.get(c)!])}::int[]) AS t(code, price, phone, userId)
      ON CONFLICT ("trackCode", "cargoId") DO UPDATE SET
        status = 'ARRIVED',
        "arrivedAt" = ${now},
        -- Excel-д үнэ байвал давуу, хоосон бол байсан үнэ хэвээр
        "adminPrice" = COALESCE(EXCLUDED."adminPrice", "Shipment"."adminPrice"),
        phone = EXCLUDED.phone,
        "userId" = EXCLUDED."userId",
        "updatedAt" = ${now}
      WHERE "Shipment".status NOT IN ('ARRIVED', 'PICKED_UP')
    `
  }
  // Аль хэдийн Ирсэн: ирсэн огноо, үнэ, төлөв хэвээр — зөвхөн Excel-ийн утсаар эзэн солигдоно (1 трак = 1 эзэн)
  const arrivedOwnerChanges = ownerChanges.filter(x => existingByCode.get(x.trackCode)?.status === 'ARRIVED')
  if (arrivedOwnerChanges.length) {
    const oc = arrivedOwnerChanges.map(x => x.trackCode)
    await prisma.$executeRaw`
      UPDATE "Shipment" s SET phone = t.phone, "userId" = t.userId
      FROM unnest(${oc}::text[], ${oc.map(c => phones[idx.get(c)!])}::text[], ${oc.map(c => userIds[idx.get(c)!])}::int[]) AS t(code, phone, userId)
      WHERE s."cargoId" = ${cargoId} AND s."trackCode" = t.code AND s.status = 'ARRIVED'
    `
  }

  checkCrossCargoOnImport(
    [...rowByCode.values()].map(r => ({ trackCode: r.trackCode, phone: parsePhone(r.phone), status: 'ARRIVED' })),
    cargoId
  ).catch(console.error)

  // Шинээр ирсэн ачааны эзэнд push (4 цагт нэг удаа)
  const arrivedNew = codes
    .map((code, i) => ({ code, userId: userIds[i], prev: existingByCode.get(code)?.status }))
    .filter(x => x.userId && x.prev !== 'ARRIVED' && x.prev !== 'PICKED_UP')
    .map(x => ({ userId: x.userId, trackCode: x.code }))
  if (arrivedNew.length) after(() => notifyArrivedForCargo(cargoId, arrivedNew))

  // Олон ачааг НЭГ бичлэгээр
  auditLater({
    cargoId, userId: admin.userId, userName: admin.name,
    action: 'shipment:import-arrived',
    detail: `${fresh.length} ачаа${alreadyArrived.length ? ` (${alreadyArrived.length} аль хэдийн ирсэн — огноо, үнэ хөндөөгүй)` : ''}${pickedUp.length ? ` (${pickedUp.length} олгогдсон тул алгассан)` : ''}${ownerChanges.length ? ` · ${ownerChanges.length} ачааны эзэн Excel-ийн утсаар солигдсон` : ''}`,
  })
  // Ачилт сонгосон бол (туршилт): ачилтад байсныг ✓, байгаагүйг «илүү» болгоно
  const dispatchId = body.dispatchId ? await openDispatchId(cargoId, body.dispatchId) : null
  const dispatch = dispatchId ? await markArrivals(dispatchId, codes) : null
  const prior = (c: string) => {
    const s = existingByCode.get(c)!
    return { trackCode: c, status: s.status, arrivedAt: s.arrivedAt, adminPrice: s.adminPrice }
  }
  return NextResponse.json({
    count: fresh.length, notCodes: notCodes.slice(0, 10), notCodeCount: notCodes.length,
    alreadyArrived: alreadyArrived.slice(0, 200).map(prior), alreadyArrivedCount: alreadyArrived.length,
    pickedUp: pickedUp.slice(0, 200).map(prior), pickedUpCount: pickedUp.length,
    duplicateRows, ownerChanges: ownerChanges.slice(0, 200), ownerChangeCount: ownerChanges.length,
    ...(dispatch ? { dispatch: { inCount: dispatch.inDispatch.length, extra: dispatch.extra.slice(0, 200), extraCount: dispatch.extra.length } } : {}),
  })
}

export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { trackCode, adminPrice, adminNote, phone: manualPhone, dispatchId: dispatchRaw } = await req.json()
  if (!trackCode) {
    return NextResponse.json({ error: 'Трак код оруулна уу' }, { status: 400 })
  }

  const code = parseArrivedCode(trackCode)
  if (!code) return NextResponse.json({ error: 'Трак код хоосон эсвэл хэт урт байна (60 тэмдэгт хүртэл)' }, { status: 400 })

  const cargoId = admin.cargoId!
  const include = { user: { select: { name: true, phone: true } } } as const
  let scan
  try {
    scan = await scanArrival({
      find: () => prisma.shipment.findUnique({ where: { trackCode_cargoId: { trackCode: code, cargoId } }, include }),
      // Эзэн: админы бичсэн утас давуу (Excel импорттой ижил дүрэм — lib/import-owner)
      owner: async existing => {
        const o = await resolveImportOwners(
          cargoId, [code], new Map([[code, manualPhone ? String(manualPhone) : null]]),
          new Map(existing ? [[code, existing]] : []),
        )
        return { phone: o.phones[0], userId: o.userIds[0] }
      },
      create: data => prisma.shipment.create({ data: { ...data, trackCode: code, cargoId }, include }),
      updateIfNotArrived: async (id, data) => {
        const { count } = await prisma.shipment.updateMany({
          where: { id, cargoId, status: { notIn: [...ARRIVED_OR_LATER] } }, data,
        })
        return count ? prisma.shipment.findUnique({ where: { id }, include }) : null
      },
    }, { price: adminPrice, note: adminNote })
  } catch (e) {
    if (e instanceof ArrivalScanConflictError) return NextResponse.json({ error: e.message }, { status: 409 })
    throw e
  }

  const dispatchId = dispatchRaw ? await openDispatchId(cargoId, dispatchRaw) : null

  if (scan.kind === 'already-arrived') {
    const body = { ...scan.shipment, alreadyArrived: true, warning: scan.message }
    if (dispatchId && scan.shipment.status === 'ARRIVED') {
      const m = await markArrivals(dispatchId, [scan.shipment.trackCode])
      return NextResponse.json({ ...body, inDispatch: m.inDispatch.length === 1 })
    }
    return NextResponse.json(body)
  }

  const shipment = scan.shipment
  checkCrossCargoOnImport([{ trackCode: code, phone: shipment.phone, status: 'ARRIVED' }], cargoId).catch(console.error)

  if (shipment.userId) {
    after(() => notifyArrivedForCargo(cargoId, [{ userId: shipment.userId, trackCode: shipment.trackCode }]))
  }

  auditLater({
    cargoId, userId: admin.userId, userName: admin.name,
    action: 'shipment:register-arrived',
    detail: `${code}${shipment.phone ? ' · ' + shipment.phone : ''}${shipment.adminPrice != null ? ' · ' + Number(shipment.adminPrice).toLocaleString() + '₮' : ''}`,
  })

  // Ачилт сонгосон бол (туршилт): энэ код ачилтад байсан эсэх
  if (dispatchId) {
    const m = await markArrivals(dispatchId, [shipment.trackCode])
    return NextResponse.json({ ...shipment, inDispatch: m.inDispatch.length === 1 })
  }
  return NextResponse.json(shipment)
}

export async function PATCH(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { id, adminPrice, adminNote, phone } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })

  const before = await prisma.shipment.findFirst({
    where: { id: Number(id), cargoId: admin.cargoId! },
    select: { trackCode: true, adminPrice: true, phone: true, adminNote: true, status: true, updatedAt: true, userId: true, user: { select: { phone: true } } },
  })
  // Утас солибол эзэн нь ч солигдоно (1 трак = 1 эзэн) — өмнө нь зөвхөн phone талбар солигдож
  // хуучин хэрэглэгчид харагдсаар байв. Олгосон ачааны эзнийг хөндөхгүй.
  let newUserId: number | null | undefined
  let newPhone: string | null | undefined = phone !== undefined ? (phone || null) : undefined
  if (before && phone && before.status !== 'PICKED_UP') {
    const owners = await resolveImportOwners(admin.cargoId!, [before.trackCode], new Map([[before.trackCode, String(phone)]]), new Map([[before.trackCode, before]]))
    if (parsePhone(phone)) { newPhone = owners.phones[0]; newUserId = owners.userIds[0] }
  }
  // Үнэ өөрчлөгдвөл түүхэнд бичнэ; олгосон ачаа бол урамшууллын зөрүүг (оноо) нөхөн бичнэ — нэг транзакцид, ачааг түгжээд
  const cargoId = admin.cargoId!
  const shipment = await prisma.$transaction(async tx => {
    const [locked] = await tx.$queryRaw<{ id: number; trackCode: string; status: string; adminPrice: Prisma.Decimal | null; receiptId: number | null }[]>`
      SELECT id, "trackCode", status::text AS status, "adminPrice", "receiptId" FROM "Shipment"
      WHERE id = ${Number(id)} AND "cargoId" = ${cargoId} FOR UPDATE`
    const updated = await tx.shipment.update({
      where: { id: Number(id), cargoId },
      data: {
        // Олгосон ачааны updatedAt = олгосон огноо — үнэ, тэмдэглэл засахад хөдлөхгүй
        ...(locked?.status === 'PICKED_UP' ? { updatedAt: before?.updatedAt } : {}),
        adminPrice: adminPrice !== undefined ? (adminPrice ? Number(adminPrice) : null) : undefined,
        adminNote: adminNote !== undefined ? (adminNote || null) : undefined,
        phone: newPhone,
        ...(newUserId !== undefined ? { userId: newUserId } : {}),
      },
    })
    if (locked && adminPrice !== undefined) {
      await recordPriceChange(tx, {
        cargoId, actor: { id: admin.userId, name: admin.name, phone: null }, shipment: locked,
        newPrice: updated.adminPrice == null ? null : Number(updated.adminPrice),
      })
    }
    return updated
  })

  // Мөнгө, эзэнтэй холбоотой тул юунаас юу болсныг хадгална
  if (before) {
    const tg = (v: unknown) => (v == null ? 'үнэгүй' : '₮' + Math.round(Number(v)).toLocaleString('en-US'))
    const changes: string[] = []
    if (Number(before.adminPrice ?? 0) !== Number(shipment.adminPrice ?? 0)) changes.push(`үнэ ${tg(before.adminPrice)} → ${tg(shipment.adminPrice)}`)
    if ((before.phone ?? '') !== (shipment.phone ?? '')) changes.push(`утас ${before.phone || '—'} → ${shipment.phone || '—'}`)
    if ((before.adminNote ?? '') !== (shipment.adminNote ?? '')) changes.push('тэмдэглэл')
    if ((before.userId ?? null) !== (shipment.userId ?? null)) changes.push(`эзэн ${before.user?.phone || '—'} → ${shipment.userId ? shipment.phone : 'бүртгэлгүй'}`)
    if (changes.length) {
      auditLater({
        cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name,
        action: 'shipment:edit', detail: `${before.trackCode}: ${changes.join(', ')}`,
      })
    }
  }
  return NextResponse.json(shipment)
}

export async function DELETE(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const body = await req.json()

  // Огноогоор bulk буцаах — тухайн өдөр (УБ цагаар) Ирсэн болгосон барааг ӨМНӨХ төлөвт нь буцаана:
  // Эрээнд уншуулж байсан бол Эрээнд ирсэн, үгүй бол Бүртгүүлсэн (revertTarget)
  if (body.date) {
    if (body.confirm !== 'БУЦААХ') {
      return NextResponse.json({ error: 'Баталгаажуулалт буруу' }, { status: 400 })
    }
    const range = ubDayRange(body.date)
    if (!range) {
      return NextResponse.json({ error: 'Огноо буруу байна' }, { status: 400 })
    }
    const where = { cargoId: admin.cargoId!, status: 'ARRIVED' as const, arrivedAt: { gte: range.start, lte: range.end } }
    // Ирсэн бүртгэлтэй зэрэг шинээр үүссэн (Эрээнээр дамжаагүй, хэрэглэгч бүртгээгүй) ачааг устгана
    const noEreen = await prisma.shipment.findMany({ where: { ...where, ereenArrivedAt: null }, select: { ...DELETION_SNAPSHOT_SELECT, arrivedAt: true } })
    const phantom = noEreen.filter(createdWithArrival)
    const { toEreen, toRegistered } = await prisma.$transaction(async tx => {
      if (phantom.length) {
        await recordDeletions(tx, admin.cargoId!, phantom, { id: admin.userId, name: admin.name }, 'arrived-revert', `${body.date} буцаалт`)
        await tx.shipment.deleteMany({ where: { id: { in: phantom.map(p => p.id) }, status: 'ARRIVED' } })
      }
      const toEreen = await tx.shipment.updateMany({ where: { ...where, ereenArrivedAt: { not: null } }, data: { status: 'EREEN_ARRIVED', adminPrice: null, arrivedAt: null } })
      const toRegistered = await tx.shipment.updateMany({ where: { ...where, ereenArrivedAt: null }, data: { status: 'REGISTERED', adminPrice: null, arrivedAt: null } })
      return { toEreen: toEreen.count, toRegistered: toRegistered.count }
    })
    const count = toEreen + toRegistered + phantom.length
    if (count > 0) {
      await logAdminAction(prisma, {
        cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name,
        action: 'shipment:revert-arrived', detail: `${body.date}: ${count} ачаа (Эрээнд ${toEreen}, Бүртгүүлсэн ${toRegistered}, устгасан ${phantom.length})`,
      })
    }
    return NextResponse.json({ count, toEreen, toRegistered, deleted: phantom.length })
  }

  const { id } = body
  if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })

  const target = await prisma.shipment.findUnique({
    where: { id: Number(id), cargoId: admin.cargoId! },
  })
  if (!target) return NextResponse.json({ error: 'Олдсонгүй' }, { status: 404 })
  if (target.status === 'PICKED_UP') {
    return NextResponse.json({ error: 'Аль хэдийн олгогдсон барааг буцааж болохгүй' }, { status: 400 })
  }
  if (target.status !== 'ARRIVED') {
    return NextResponse.json({ error: 'Зөвхөн Ирсэн барааг буцаана' }, { status: 400 })
  }

  // Ирсэн бүртгэлтэй зэрэг шинээр үүссэн бол өмнөх төлөв алга — устгана
  if (createdWithArrival(target)) {
    const snap = await prisma.shipment.findUnique({ where: { id: target.id }, select: DELETION_SNAPSHOT_SELECT })
    await prisma.$transaction(async tx => {
      if (snap) await recordDeletions(tx, admin.cargoId!, [snap], { id: admin.userId, name: admin.name }, 'arrived-revert')
      await tx.shipment.deleteMany({ where: { id: target.id, status: 'ARRIVED' } })
    })
    await logAdminAction(prisma, {
      cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name,
      action: 'shipment:revert-arrived', detail: `${target.trackCode} (устгасан — Ирсэн бүртгэлээр үүссэн)`,
    })
    return NextResponse.json({ ok: true, deleted: true })
  }
  await prisma.shipment.update({
    where: { id: Number(id), cargoId: admin.cargoId! },
    data: { status: target.ereenArrivedAt ? 'EREEN_ARRIVED' : 'REGISTERED', adminPrice: null, arrivedAt: null },
  })
  await logAdminAction(prisma, {
    cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name,
    action: 'shipment:revert-arrived', detail: target.trackCode,
  })
  return NextResponse.json({ ok: true })
}

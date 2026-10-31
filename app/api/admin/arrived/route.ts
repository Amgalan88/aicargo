import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { checkCrossCargoOnImport } from '@/lib/notifications'
import { logAdminAction, auditLater } from '@/lib/audit'
import { notifyArrivedForCargo } from '@/lib/push'
import { parseArrivedCode } from '@/lib/track-code'
import { resolveImportOwners } from '@/lib/import-owner'
import { ubDayRange } from '@/lib/ub-date'
import { importLimitError } from '@/lib/import-limits'
import { openDispatchId, markArrivals } from '@/lib/dispatch'

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
  const prices = codes.map(c => { const p = rowByCode.get(c)!.price; return typeof p === 'number' ? p : null })
  // Олгогдсон ачааг хөндөхгүй тул эзэн нь ч солигдохгүй
  const ownerChanges = changes.filter(x => existingByCode.get(x.trackCode)?.status !== 'PICKED_UP')
  const duplicateRows = rows.length - notCodes.length - codes.length

  const now = new Date()
  await prisma.$executeRaw`
    INSERT INTO "Shipment" ("trackCode", status, "arrivedAt", "adminPrice", phone, "cargoId", "userId", "createdAt", "updatedAt")
    SELECT t.code, 'ARRIVED'::"Status", ${now}, t.price, t.phone, ${cargoId}, t.userId, ${now}, ${now}
    FROM unnest(${codes}::text[], ${prices}::numeric[], ${phones}::text[], ${userIds}::int[]) AS t(code, price, phone, userId)
    ON CONFLICT ("trackCode", "cargoId") DO UPDATE SET
      status = 'ARRIVED',
      "arrivedAt" = ${now},
      "adminPrice" = EXCLUDED."adminPrice",
      phone = EXCLUDED.phone,
      "userId" = EXCLUDED."userId",
      "updatedAt" = ${now}
    WHERE "Shipment".status != 'PICKED_UP'
  `

  checkCrossCargoOnImport(
    [...rowByCode.values()].map(r => ({ trackCode: r.trackCode, phone: r.phone?.trim() || null, status: 'ARRIVED' })),
    cargoId
  ).catch(console.error)

  // Шинээр ирсэн ачааны эзэнд push (4 цагт нэг удаа)
  const arrivedNew = codes
    .map((code, i) => ({ code, userId: userIds[i], prev: existingByCode.get(code)?.status }))
    .filter(x => x.userId && x.prev !== 'ARRIVED' && x.prev !== 'PICKED_UP')
    .map(x => ({ userId: x.userId, trackCode: x.code }))
  if (arrivedNew.length) after(() => notifyArrivedForCargo(cargoId, arrivedNew))

  // PICKED_UP статустай мөрүүд WHERE-д тааруулагдаагүй тул бодитоор шинэчлэгдээгүй
  const skipped = codes.filter(c => existingByCode.get(c)?.status === 'PICKED_UP').length
  // Олон ачааг НЭГ бичлэгээр
  auditLater({
    cargoId, userId: admin.userId, userName: admin.name,
    action: 'shipment:import-arrived',
    detail: `${codes.length - skipped} ачаа${skipped ? ` (${skipped} олгогдсон тул алгассан)` : ''}${ownerChanges.length ? ` · ${ownerChanges.length} ачааны эзэн Excel-ийн утсаар солигдсон` : ''}`,
  })
  // Ачилт сонгосон бол (туршилт): ачилтад байсныг ✓, байгаагүйг «илүү» болгоно
  const dispatchId = body.dispatchId ? await openDispatchId(cargoId, body.dispatchId) : null
  const dispatch = dispatchId ? await markArrivals(dispatchId, codes) : null
  return NextResponse.json({
    count: codes.length - skipped, notCodes: notCodes.slice(0, 10), notCodeCount: notCodes.length,
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

  // Try to find existing shipment to get user's phone
  const existing = await prisma.shipment.findUnique({
    where: { trackCode_cargoId: { trackCode: code, cargoId: admin.cargoId! } },
    include: { user: { select: { phone: true } } },
  })

  if (existing?.status === 'PICKED_UP') {
    return NextResponse.json({ error: 'Энэ бараа аль хэдийн олгогдсон байна' }, { status: 400 })
  }

  // Эзэн: админы бичсэн утас давуу (Excel импорттой ижил дүрэм — lib/import-owner)
  const owners = await resolveImportOwners(
    admin.cargoId!, [code], new Map([[code, manualPhone ? String(manualPhone) : null]]),
    new Map(existing ? [[code, existing]] : []),
  )
  const resolvedPhone = owners.phones[0]
  const resolvedUserId = owners.userIds[0]

  const shipment = await prisma.shipment.upsert({
    where: { trackCode_cargoId: { trackCode: code, cargoId: admin.cargoId! } },
    update: {
      status: 'ARRIVED',
      arrivedAt: new Date(),
      adminPrice: adminPrice ? Number(adminPrice) : null,
      adminNote: adminNote || null,
      phone: resolvedPhone,
      userId: resolvedUserId,
    },
    create: {
      trackCode: code,
      status: 'ARRIVED',
      arrivedAt: new Date(),
      adminPrice: adminPrice ? Number(adminPrice) : null,
      adminNote: adminNote || null,
      phone: resolvedPhone,
      cargoId: admin.cargoId!,
      ...(resolvedUserId ? { userId: resolvedUserId } : {}),
    },
    include: { user: { select: { name: true, phone: true } } },
  })

  checkCrossCargoOnImport([{ trackCode: code, phone: resolvedPhone, status: 'ARRIVED' }], admin.cargoId!).catch(console.error)

  // Шинээр ирсэн бол эзэнд нь push (үнэ засахад дахин очихгүй)
  if (shipment.userId && existing?.status !== 'ARRIVED') {
    const cargoId = admin.cargoId!
    after(() => notifyArrivedForCargo(cargoId, [{ userId: shipment.userId, trackCode: shipment.trackCode }]))
  }

  auditLater({
    cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name,
    action: 'shipment:register-arrived',
    detail: `${code}${resolvedPhone ? ' · ' + resolvedPhone : ''}${adminPrice ? ' · ' + Number(adminPrice).toLocaleString() + '₮' : ''}`,
  })

  // Ачилт сонгосон бол (туршилт): энэ код ачилтад байсан эсэх
  const dispatchId = dispatchRaw ? await openDispatchId(admin.cargoId!, dispatchRaw) : null
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
    select: { trackCode: true, adminPrice: true, phone: true, adminNote: true, status: true, updatedAt: true },
  })
  const shipment = await prisma.shipment.update({
    where: { id: Number(id), cargoId: admin.cargoId! },
    data: {
      // Олгосон ачааны updatedAt = олгосон огноо — үнэ, тэмдэглэл засахад хөдлөхгүй
      ...(before?.status === 'PICKED_UP' ? { updatedAt: before.updatedAt } : {}),
      adminPrice: adminPrice !== undefined ? (adminPrice ? Number(adminPrice) : null) : undefined,
      adminNote: adminNote !== undefined ? (adminNote || null) : undefined,
      phone: phone !== undefined ? (phone || null) : undefined,
    },
  })

  // Мөнгө, эзэнтэй холбоотой тул юунаас юу болсныг хадгална
  if (before) {
    const tg = (v: unknown) => (v == null ? 'үнэгүй' : '₮' + Math.round(Number(v)).toLocaleString('en-US'))
    const changes: string[] = []
    if (Number(before.adminPrice ?? 0) !== Number(shipment.adminPrice ?? 0)) changes.push(`үнэ ${tg(before.adminPrice)} → ${tg(shipment.adminPrice)}`)
    if ((before.phone ?? '') !== (shipment.phone ?? '')) changes.push(`утас ${before.phone || '—'} → ${shipment.phone || '—'}`)
    if ((before.adminNote ?? '') !== (shipment.adminNote ?? '')) changes.push('тэмдэглэл')
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
    const [toEreen, toRegistered] = await prisma.$transaction([
      prisma.shipment.updateMany({ where: { ...where, ereenArrivedAt: { not: null } }, data: { status: 'EREEN_ARRIVED', adminPrice: null, arrivedAt: null } }),
      prisma.shipment.updateMany({ where: { ...where, ereenArrivedAt: null }, data: { status: 'REGISTERED', adminPrice: null, arrivedAt: null } }),
    ])
    const count = toEreen.count + toRegistered.count
    if (count > 0) {
      await logAdminAction(prisma, {
        cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name,
        action: 'shipment:revert-arrived', detail: `${body.date}: ${count} ачаа (Эрээнд ${toEreen.count}, Бүртгүүлсэн ${toRegistered.count})`,
      })
    }
    return NextResponse.json({ count, toEreen: toEreen.count, toRegistered: toRegistered.count })
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

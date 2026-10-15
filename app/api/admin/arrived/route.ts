import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { checkCrossCargoOnImport } from '@/lib/notifications'
import { logAdminAction, auditLater } from '@/lib/audit'
import { notifyArrivedForCargo } from '@/lib/push'
import { parseTrackCode } from '@/lib/track-code'

// Excel-ээс олон зуун мөр орж ирж болдог тул мөр мөрөөр DB руу хандвал
// round-trip хэтэрч timeout болно (batch feature дээр олдсонтой ижил алдаа) —
// доор бүх мөрийг НЭГ bulk upsert query-гээр бичнэ.
export const maxDuration = 60

export async function PUT(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { rows }: { rows: { trackCode: string; phone?: string; price?: number }[] } = await req.json()
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'Өгөгдөл хоосон' }, { status: 400 })
  }
  const cargoId = admin.cargoId!

  // Нэг импортод ижил код давхар орвол сүүлийнх нь дийлдэнэ (bulk upsert нэг
  // conflict target-ийг хоёр удаа хөндөж чадахгүй тул урьдчилан dedupe хийнэ)
  const rowByCode = new Map<string, { trackCode: string; phone?: string; price?: number }>()
  const notCodes: string[] = []
  for (const r of rows) {
    const c = parseTrackCode(r.trackCode)
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

  const resolvedPhoneByCode = new Map<string, string | null>()
  const phonesNeedingLookup = new Set<string>()
  for (const code of codes) {
    const existing = existingByCode.get(code)
    const manualPhone = rowByCode.get(code)!.phone?.trim() || null
    const resolvedPhone = existing?.user?.phone || existing?.phone || manualPhone || null
    resolvedPhoneByCode.set(code, resolvedPhone)
    if (!existing?.userId && resolvedPhone) phonesNeedingLookup.add(resolvedPhone)
  }
  const matchedUsers = phonesNeedingLookup.size > 0
    ? await prisma.user.findMany({ where: { cargoId, phone: { in: Array.from(phonesNeedingLookup) } }, select: { id: true, phone: true } })
    : []
  const userIdByPhone = new Map(matchedUsers.map(u => [u.phone, u.id]))

  const prices: (number | null)[] = []
  const phones: (string | null)[] = []
  const userIds: (number | null)[] = []
  for (const code of codes) {
    const existing = existingByCode.get(code)
    const resolvedPhone = resolvedPhoneByCode.get(code) ?? null
    const resolvedUserId = existing?.userId ?? (resolvedPhone ? userIdByPhone.get(resolvedPhone) ?? null : null)
    const price = rowByCode.get(code)!.price
    prices.push(typeof price === 'number' ? price : null)
    phones.push(resolvedPhone)
    userIds.push(resolvedUserId)
  }

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
      "userId" = COALESCE(EXCLUDED."userId", "Shipment"."userId"),
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
    detail: `${codes.length - skipped} ачаа${skipped ? ` (${skipped} олгогдсон тул алгассан)` : ''}`,
  })
  return NextResponse.json({ count: codes.length - skipped, notCodes: notCodes.slice(0, 10), notCodeCount: notCodes.length })
}

export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { trackCode, adminPrice, adminNote, phone: manualPhone } = await req.json()
  if (!trackCode) {
    return NextResponse.json({ error: 'Трак код оруулна уу' }, { status: 400 })
  }

  const code = parseTrackCode(trackCode)
  if (!code) return NextResponse.json({ error: `Трак код биш байна: "${String(trackCode).slice(0, 40)}"` }, { status: 400 })

  // Try to find existing shipment to get user's phone
  const existing = await prisma.shipment.findUnique({
    where: { trackCode_cargoId: { trackCode: code, cargoId: admin.cargoId! } },
    include: { user: { select: { phone: true } } },
  })

  if (existing?.status === 'PICKED_UP') {
    return NextResponse.json({ error: 'Энэ бараа аль хэдийн олгогдсон байна' }, { status: 400 })
  }

  const resolvedPhone = existing?.user?.phone || existing?.phone || manualPhone || null

  // Auto-link userId only if user belongs to THIS cargo
  let resolvedUserId = existing?.userId ?? null
  if (!resolvedUserId && resolvedPhone) {
    const matchedUser = await prisma.user.findFirst({ where: { phone: resolvedPhone, cargoId: admin.cargoId! } })
    if (matchedUser) resolvedUserId = matchedUser.id
  }

  const shipment = await prisma.shipment.upsert({
    where: { trackCode_cargoId: { trackCode: code, cargoId: admin.cargoId! } },
    update: {
      status: 'ARRIVED',
      arrivedAt: new Date(),
      adminPrice: adminPrice ? Number(adminPrice) : null,
      adminNote: adminNote || null,
      phone: resolvedPhone,
      ...(resolvedUserId ? { userId: resolvedUserId } : {}),
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
    select: { trackCode: true, adminPrice: true, phone: true, adminNote: true },
  })
  const shipment = await prisma.shipment.update({
    where: { id: Number(id), cargoId: admin.cargoId! },
    data: {
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

  // Огноогоор bulk буцаах — тухайн өдөр Ирсэн болгосон бүх барааг Эрээнд буцаана
  if (body.date) {
    if (body.confirm !== 'УСТГАХ') {
      return NextResponse.json({ error: 'Баталгаажуулалт буруу' }, { status: 400 })
    }
    const dayStart = new Date(`${body.date}T00:00:00`)
    const dayEnd = new Date(`${body.date}T23:59:59.999`)
    if (isNaN(dayStart.getTime())) {
      return NextResponse.json({ error: 'Огноо буруу байна' }, { status: 400 })
    }
    const { count } = await prisma.shipment.updateMany({
      where: { cargoId: admin.cargoId!, status: 'ARRIVED', arrivedAt: { gte: dayStart, lte: dayEnd } },
      data: { status: 'EREEN_ARRIVED', adminPrice: null, arrivedAt: null },
    })
    if (count > 0) {
      await logAdminAction(prisma, {
        cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name,
        action: 'shipment:revert-arrived', detail: `${body.date}: ${count} ачаа`,
      })
    }
    return NextResponse.json({ count })
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

  await prisma.shipment.update({
    where: { id: Number(id), cargoId: admin.cargoId! },
    data: { status: 'EREEN_ARRIVED', adminPrice: null, arrivedAt: null },
  })
  await logAdminAction(prisma, {
    cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name,
    action: 'shipment:revert-arrived', detail: target.trackCode,
  })
  return NextResponse.json({ ok: true })
}

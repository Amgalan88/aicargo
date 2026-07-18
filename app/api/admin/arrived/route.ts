import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { checkCrossCargoOnImport } from '@/lib/notifications'

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
  for (const r of rows) rowByCode.set(r.trackCode.trim().toUpperCase(), r)
  const codes = Array.from(rowByCode.keys())

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
    rows.map(r => ({ trackCode: r.trackCode.trim().toUpperCase(), phone: r.phone?.trim() || null, status: 'ARRIVED' })),
    cargoId
  ).catch(console.error)

  // PICKED_UP статустай мөрүүд WHERE-д тааруулагдаагүй тул бодитоор шинэчлэгдээгүй
  const skipped = codes.filter(c => existingByCode.get(c)?.status === 'PICKED_UP').length
  return NextResponse.json({ count: codes.length - skipped })
}

export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { trackCode, adminPrice, adminNote, phone: manualPhone } = await req.json()
  if (!trackCode) {
    return NextResponse.json({ error: 'Трак код оруулна уу' }, { status: 400 })
  }

  const code = trackCode.trim().toUpperCase()

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

  return NextResponse.json(shipment)
}

export async function PATCH(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { id, adminPrice, adminNote, phone } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })

  const shipment = await prisma.shipment.update({
    where: { id: Number(id), cargoId: admin.cargoId! },
    data: {
      adminPrice: adminPrice !== undefined ? (adminPrice ? Number(adminPrice) : null) : undefined,
      adminNote: adminNote !== undefined ? (adminNote || null) : undefined,
      phone: phone !== undefined ? (phone || null) : undefined,
    },
  })
  return NextResponse.json(shipment)
}

export async function DELETE(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { id } = await req.json()
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
  return NextResponse.json({ ok: true })
}

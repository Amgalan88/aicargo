import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { checkCrossCargoOnImport } from '@/lib/notifications'

export async function PUT(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { rows }: { rows: { trackCode: string; phone?: string; price?: number }[] } = await req.json()
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'Өгөгдөл хоосон' }, { status: 400 })
  }

  const results = await Promise.all(rows.map(async ({ trackCode, phone: manualPhone, price }) => {
    const code = trackCode.trim().toUpperCase()
    const existing = await prisma.shipment.findUnique({
      where: { trackCode_cargoId: { trackCode: code, cargoId: admin.cargoId! } },
      include: { user: { select: { phone: true } } },
    })
    if (existing?.status === 'PICKED_UP') return null
    const resolvedPhone = existing?.user?.phone || existing?.phone || manualPhone || null
    let resolvedUserId = existing?.userId ?? null
    if (!resolvedUserId && resolvedPhone) {
      const matchedUser = await prisma.user.findFirst({ where: { phone: resolvedPhone, cargoId: admin.cargoId! } })
      if (matchedUser) resolvedUserId = matchedUser.id
    }
    return prisma.shipment.upsert({
      where: { trackCode_cargoId: { trackCode: code, cargoId: admin.cargoId! } },
      update: { status: 'ARRIVED', adminPrice: price ?? null, phone: resolvedPhone, ...(resolvedUserId ? { userId: resolvedUserId } : {}) },
      create: { trackCode: code, status: 'ARRIVED', adminPrice: price ?? null, phone: resolvedPhone, cargoId: admin.cargoId!, ...(resolvedUserId ? { userId: resolvedUserId } : {}) },
    })
  }))

  checkCrossCargoOnImport(
    rows.map(r => ({ trackCode: r.trackCode.trim().toUpperCase(), phone: r.phone?.trim() || null, status: 'ARRIVED' })),
    admin.cargoId!
  ).catch(console.error)

  return NextResponse.json({ count: results.filter(Boolean).length })
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
      adminPrice: adminPrice ? Number(adminPrice) : null,
      adminNote: adminNote || null,
      phone: resolvedPhone,
      ...(resolvedUserId ? { userId: resolvedUserId } : {}),
    },
    create: {
      trackCode: code,
      status: 'ARRIVED',
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
    data: { status: 'EREEN_ARRIVED', adminPrice: null },
  })
  return NextResponse.json({ ok: true })
}

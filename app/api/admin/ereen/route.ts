import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { recordDeletions, DELETION_SNAPSHOT_SELECT } from '@/lib/shipment-deletion'

export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { trackCode } = await req.json()
  if (!trackCode) {
    return NextResponse.json({ error: 'Трак код оруулна уу' }, { status: 400 })
  }

  const code = trackCode.trim().toUpperCase()

  const existing = await prisma.shipment.findUnique({
    where: { trackCode_cargoId: { trackCode: code, cargoId: admin.cargoId! } },
    select: { phone: true, userId: true },
  })

  let userId: number | null = existing?.userId ?? null
  if (!userId && existing?.phone) {
    const user = await prisma.user.findFirst({ where: { phone: existing.phone, cargoId: admin.cargoId! } })
    if (user) userId = user.id
  }

  const shipment = await prisma.shipment.upsert({
    where: { trackCode_cargoId: { trackCode: code, cargoId: admin.cargoId! } },
    update: { status: 'EREEN_ARRIVED', ereenArrivedAt: new Date(), ...(userId ? { userId } : {}) },
    create: { trackCode: code, status: 'EREEN_ARRIVED', ereenArrivedAt: new Date(), cargoId: admin.cargoId!, ...(userId ? { userId } : {}) },
    include: { user: { select: { name: true, phone: true } } },
  })

  return NextResponse.json(shipment)
}

export async function DELETE(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { confirm } = await req.json()
  if (confirm !== 'УСТГАХ') {
    return NextResponse.json({ error: 'Баталгаажуулалт буруу' }, { status: 400 })
  }

  // Устгал, түүх, аудит нэг transaction-д (Эрээний ачаа каргод ~1000 хүртэл)
  const count = await prisma.$transaction(async tx => {
    const targets = await tx.shipment.findMany({ where: { cargoId: admin.cargoId!, status: 'EREEN_ARRIVED' }, select: DELETION_SNAPSHOT_SELECT })
    if (!targets.length) return 0
    await recordDeletions(tx, admin.cargoId!, targets, { id: admin.userId, name: admin.name }, 'ereen-all')
    const { count } = await tx.shipment.deleteMany({ where: { id: { in: targets.map(t => t.id) }, status: 'EREEN_ARRIVED' } })
    await tx.adminAuditLog.create({
      data: { cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name, action: 'shipment:ereen-all-deleted', detail: `${count} ачаа` },
    })
    return count
  }, { timeout: 30_000 })

  return NextResponse.json({ count })
}

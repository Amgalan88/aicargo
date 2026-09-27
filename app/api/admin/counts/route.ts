import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

// GET /api/admin/counts — админ цэсний ажлын урсгал дээрх тоонууд (статус бүрээр)
export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  if (!admin.cargoId) return NextResponse.json({ error: 'CargoId шаардлагатай' }, { status: 400 })

  const [shipments, batches] = await Promise.all([
    prisma.shipment.groupBy({
      by: ['status'],
      where: { cargoId: admin.cargoId, status: { in: ['REGISTERED', 'EREEN_ARRIVED', 'ARRIVED'] } },
      _count: { _all: true },
    }),
    prisma.batch.groupBy({
      by: ['status'],
      where: { cargoId: admin.cargoId, status: { in: ['EREEN_ARRIVED', 'ARRIVED'] } },
      _count: { _all: true },
    }),
  ])

  const s = Object.fromEntries(shipments.map(r => [r.status, r._count._all]))
  const b = Object.fromEntries(batches.map(r => [r.status, r._count._all]))
  return NextResponse.json({
    registered: s.REGISTERED ?? 0,
    ereen: s.EREEN_ARRIVED ?? 0,
    arrived: s.ARRIVED ?? 0,
    batchesShipped: b.EREEN_ARRIVED ?? 0,
    batchesArrived: b.ARRIVED ?? 0,
  })
}

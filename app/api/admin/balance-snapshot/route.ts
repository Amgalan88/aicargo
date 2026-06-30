import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const atStr = req.nextUrl.searchParams.get('at')
  if (!atStr) return NextResponse.json({ error: 'Огноо оруулна уу' }, { status: 400 })

  const at = new Date(atStr)
  if (isNaN(at.getTime())) return NextResponse.json({ error: 'Огноо буруу' }, { status: 400 })

  const cargoId = admin.cargoId!

  // Shipments that were in ARRIVED state at the given time:
  // 1. Still ARRIVED now, and became arrived before the cutoff
  // 2. Already PICKED_UP, but picked up after the cutoff (so at cutoff they were still arrived)
  const [stillArrived, pickedUpAfter] = await Promise.all([
    prisma.shipment.findMany({
      where: { cargoId, status: 'ARRIVED', updatedAt: { lte: at } },
      select: { trackCode: true, phone: true, adminPrice: true, description: true, updatedAt: true, user: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.shipment.findMany({
      where: { cargoId, status: 'PICKED_UP', updatedAt: { gt: at } },
      select: { trackCode: true, phone: true, adminPrice: true, description: true, updatedAt: true, user: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  const shipments = [...stillArrived, ...pickedUpAfter]
  const total = shipments.reduce((s, r) => s + (Number(r.adminPrice) || 0), 0)
  const withPrice = shipments.filter(r => r.adminPrice && Number(r.adminPrice) > 0)

  return NextResponse.json({ shipments, total, count: shipments.length, withPriceCount: withPrice.length })
}

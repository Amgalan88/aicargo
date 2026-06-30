import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const fromStr = req.nextUrl.searchParams.get('from')
  const toStr = req.nextUrl.searchParams.get('to')
  if (!fromStr || !toStr) return NextResponse.json({ error: 'Огноо оруулна уу' }, { status: 400 })

  const from = new Date(fromStr)
  const to = new Date(toStr)
  to.setHours(23, 59, 59, 999)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return NextResponse.json({ error: 'Огноо буруу' }, { status: 400 })

  const shipments = await prisma.shipment.findMany({
    where: {
      cargoId: admin.cargoId!,
      status: { in: ['ARRIVED', 'PICKED_UP'] },
      updatedAt: { gte: from, lte: to },
    },
    select: {
      trackCode: true,
      phone: true,
      adminPrice: true,
      description: true,
      status: true,
      updatedAt: true,
      user: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const total = shipments.reduce((s, r) => s + (Number(r.adminPrice) || 0), 0)
  const withPrice = shipments.filter(r => r.adminPrice && Number(r.adminPrice) > 0)

  return NextResponse.json({ shipments, total, count: shipments.length, withPriceCount: withPrice.length })
}

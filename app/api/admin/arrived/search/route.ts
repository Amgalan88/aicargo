import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const q = req.nextUrl.searchParams.get('q')?.trim()
  const statsOnly = req.nextUrl.searchParams.get('stats') === '1'
  const dateParam = req.nextUrl.searchParams.get('date')?.trim()
  const isPhone = q && /^\d+$/.test(q)

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  if (statsOnly) {
    const rows = await prisma.shipment.findMany({
      where: { status: 'ARRIVED', cargoId: admin.cargoId!, updatedAt: { gte: todayStart } },
      select: { adminPrice: true },
    })
    const count = rows.length
    const total = rows.reduce((s, r) => s + (r.adminPrice ? Number(r.adminPrice) : 0), 0)
    const noPrice = rows.filter(r => !r.adminPrice).length
    return NextResponse.json({ count, total, noPrice })
  }

  // Огноогоор bulk буцаах хэсэгт урьдчилан хэдэн бараа тохирохыг харуулна
  if (dateParam) {
    const dayStart = new Date(`${dateParam}T00:00:00`)
    const dayEnd = new Date(`${dateParam}T23:59:59.999`)
    if (isNaN(dayStart.getTime())) return NextResponse.json({ error: 'Огноо буруу байна' }, { status: 400 })
    const shipments = await prisma.shipment.findMany({
      where: { status: 'ARRIVED', cargoId: admin.cargoId!, arrivedAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { arrivedAt: 'desc' },
      select: {
        id: true, trackCode: true, phone: true, adminPrice: true, adminNote: true,
        createdAt: true, updatedAt: true, description: true,
        user: { select: { name: true, phone: true } },
      },
    })
    return NextResponse.json(shipments)
  }

  const shipments = await prisma.shipment.findMany({
    where: {
      status: 'ARRIVED',
      cargoId: admin.cargoId!,
      ...(q ? isPhone
        ? { phone: { contains: q } }
        : { trackCode: { contains: q.toUpperCase() } }
      : { updatedAt: { gte: todayStart } }),
    },
    orderBy: { updatedAt: 'desc' },
    ...(!q ? {} : { take: 50 }),
    select: {
      id: true,
      trackCode: true,
      phone: true,
      adminPrice: true,
      adminNote: true,
      createdAt: true,
      updatedAt: true,
      description: true,
      user: { select: { name: true, phone: true } },
    },
  })

  return NextResponse.json(shipments)
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

const PAGE_SIZE = 20

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || '1'))

  const where: any = { status: 'PICKED_UP', cargoId: admin.cargoId! }
  if (q) {
    where.OR = [
      { phone: { contains: q } },
      { trackCode: { contains: q.toUpperCase() } },
    ]
  }

  const [total, items] = await Promise.all([
    prisma.shipment.count({ where }),
    prisma.shipment.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        trackCode: true,
        phone: true,
        adminPrice: true,
        adminNote: true,
        updatedAt: true,
      },
    }),
  ])

  return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE })
}

// PATCH /api/admin/history — revert PICKED_UP → ARRIVED
export async function PATCH(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })

  const shipment = await prisma.shipment.findUnique({ where: { id: Number(id) } })
  if (!shipment || shipment.status !== 'PICKED_UP' || shipment.cargoId !== admin.cargoId) {
    return NextResponse.json({ error: 'Олдсонгүй эсвэл буцаах боломжгүй' }, { status: 400 })
  }

  await prisma.shipment.update({ where: { id: Number(id) }, data: { status: 'ARRIVED' } })
  return NextResponse.json({ ok: true })
}

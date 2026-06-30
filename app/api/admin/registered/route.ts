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

  const where: any = { status: 'REGISTERED', cargoId: admin.cargoId! }
  if (q) {
    where.OR = [
      { trackCode: { contains: q.toUpperCase() } },
      { user: { phone: { contains: q } } },
      { user: { name: { contains: q } } },
    ]
  }

  const [total, items] = await Promise.all([
    prisma.shipment.count({ where }),
    prisma.shipment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        trackCode: true,
        description: true,
        createdAt: true,
        user: { select: { name: true, phone: true } },
      },
    }),
  ])

  return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const q = req.nextUrl.searchParams.get('q')?.trim()
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || '1'))
  const PAGE_SIZE = 20

  const where = q ? {
    cargoId: admin.cargoId!,
    OR: [
      { name: { contains: q } },
      { phone: { contains: q } },
    ],
  } : { cargoId: admin.cargoId! }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        createdAt: true,
        _count: { select: { shipments: true } },
      },
    }),
  ])

  return NextResponse.json({ users, total, page, pageSize: PAGE_SIZE })
}

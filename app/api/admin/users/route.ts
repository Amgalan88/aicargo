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

  const [total, rows] = await Promise.all([
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
        phoneVerifiedAt: true,
        createdAt: true,
      },
    }),
  ])

  // Ачааны тоог зөвхөн энэ хуудасны 20 хүнд тоолно (өмнө нь каргын бүх ачааг тоолдог байсан — ачаа өсөхөд удааширна).
  // Зөвхөн энэ каргын ачаа — карго шилжсэн хэрэглэгчийн хуучин каргын ачааг тоолохгүй.
  const counts = rows.length
    ? await prisma.shipment.groupBy({
        by: ['userId'],
        where: { cargoId: admin.cargoId!, userId: { in: rows.map(u => u.id) } },
        _count: { _all: true },
      })
    : []
  const byUser = new Map(counts.map(c => [c.userId, c._count._all]))
  const users = rows.map(u => ({ ...u, _count: { shipments: byUser.get(u.id) ?? 0 } }))

  return NextResponse.json({ users, total, page, pageSize: PAGE_SIZE })
}

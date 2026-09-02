import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

const PAGE_SIZE = 30

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  if (admin.isStaffAdmin) return forbidden() // аудит логийг зөвхөн эзэмшигч харна

  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || '1'))
  const where = { cargoId: admin.cargoId! }

  const [total, items] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, userName: true, action: true, detail: true, createdAt: true },
    }),
  ])

  return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const cargos = await prisma.cargo.findMany({
    orderBy: { id: 'asc' },
    include: {
      _count: { select: { users: true, shipments: true } },
      users: {
        where: { role: 'ADMIN' },
        select: { id: true, name: true, phone: true },
      },
      shipments: {
        select: { status: true },
      },
    },
  })

  const result = cargos.map(c => {
    const counts = { REGISTERED: 0, EREEN_ARRIVED: 0, ARRIVED: 0, PICKED_UP: 0 }
    for (const s of c.shipments) {
      counts[s.status] = (counts[s.status] ?? 0) + 1
    }
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      ereemReceiver: c.ereemReceiver,
      ereemPhone: c.ereemPhone,
      ereemRegion: (c as any).ereemRegion ?? '',
      ereemAddress: c.ereemAddress,
      logoUrl: (c as any).logoUrl ?? null,
      bankName: (c as any).bankName ?? null,
      bankAccountHolder: (c as any).bankAccountHolder ?? null,
      bankAccountNumber: (c as any).bankAccountNumber ?? null,
      bankTransferNote: (c as any).bankTransferNote ?? null,
      notificationsEnabled: (c as any).notificationsEnabled ?? false,
      searchByPhone: (c as any).searchByPhone ?? false,
      batchEnabled: (c as any).batchEnabled ?? false,
      aiEnabled: (c as any).aiEnabled ?? false,
      paidUntil: (c as any).paidUntil ?? null,
      createdAt: c.createdAt,
      totalUsers: c._count.users,
      totalShipments: c._count.shipments,
      admins: c.users,
      statusCounts: counts,
    }
  })

  return NextResponse.json(result)
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') return forbidden()
  if (!user.cargoId) return NextResponse.json({ error: 'CargoId шаардлагатай' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const countOnly = searchParams.get('count') === '1'
  const showArchived = searchParams.get('archived') === '1'

  if (countOnly) {
    const count = await (prisma.notification as any).count({
      where: { cargoId: user.cargoId, read: false, archived: false },
    })
    return NextResponse.json({ count })
  }

  const notifications = await (prisma.notification as any).findMany({
    where: { cargoId: user.cargoId, archived: showArchived },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json(notifications)
}

// PATCH /api/admin/notifications — mark all as read
export async function PATCH(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') return forbidden()
  if (!user.cargoId) return NextResponse.json({ error: 'CargoId шаардлагатай' }, { status: 400 })

  await (prisma.notification as any).updateMany({
    where: { cargoId: user.cargoId, read: false, archived: false },
    data: { read: true },
  })

  return NextResponse.json({ ok: true })
}

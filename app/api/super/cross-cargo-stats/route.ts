import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [total, last30, unread] = await Promise.all([
    prisma.notification.groupBy({
      by: ['cargoId'],
      where: { type: 'CROSS_CARGO' },
      _count: { id: true },
    }),
    prisma.notification.groupBy({
      by: ['cargoId'],
      where: { type: 'CROSS_CARGO', createdAt: { gte: since30 } },
      _count: { id: true },
    }),
    prisma.notification.groupBy({
      by: ['cargoId'],
      where: { type: 'CROSS_CARGO', read: false, archived: false },
      _count: { id: true },
    }),
  ])

  const cargos = await (prisma.cargo as any).findMany({
    select: { id: true, name: true },
  })

  const totalMap = Object.fromEntries(total.map(r => [r.cargoId, r._count.id]))
  const last30Map = Object.fromEntries(last30.map(r => [r.cargoId, r._count.id]))
  const unreadMap = Object.fromEntries(unread.map(r => [r.cargoId, r._count.id]))

  const result = cargos
    .map((c: any) => ({
      cargoId: c.id,
      name: c.name,
      total: totalMap[c.id] ?? 0,
      last30: last30Map[c.id] ?? 0,
      unread: unreadMap[c.id] ?? 0,
    }))
    .filter((r: any) => r.total > 0)
    .sort((a: any, b: any) => b.total - a.total)

  const grandTotal = total.reduce((s, r) => s + r._count.id, 0)
  const grandLast30 = last30.reduce((s, r) => s + r._count.id, 0)

  return NextResponse.json({ rows: result, grandTotal, grandLast30 })
}

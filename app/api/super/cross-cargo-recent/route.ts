import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const notifs = await prisma.notification.findMany({
    where: { type: 'CROSS_CARGO' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      cargoId: true,
      body: true,
      read: true,
      createdAt: true,
      cargo: { select: { name: true } },
    },
  })

  return NextResponse.json(
    notifs.map(n => ({
      id: n.id,
      cargoId: n.cargoId,
      cargoName: n.cargo.name,
      body: n.body,
      read: n.read,
      createdAt: n.createdAt,
    }))
  )
}

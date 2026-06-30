import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') return forbidden()

  const now = new Date()
  const banner = await (prisma.superBanner as any).findFirst({
    where: {
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      dismisses: { none: { userId: user.userId } },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, content: true, imageUrl: true, expiresAt: true },
  })
  return NextResponse.json(banner ?? null)
}

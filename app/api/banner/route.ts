import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()

  const now = new Date()
  const banner = await (prisma.banner as any).findFirst({
    where: {
      cargoId: user.cargoId!,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      dismisses: { none: { userId: user.userId } },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, content: true, imageUrl: true, expiresAt: true },
  })
  return NextResponse.json(banner ?? null)
}

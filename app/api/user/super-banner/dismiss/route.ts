import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'USER') return forbidden()

  const { superBannerId } = await req.json()
  if (!superBannerId) return NextResponse.json({ error: 'superBannerId шаардлагатай' }, { status: 400 })

  await (prisma.superBannerDismiss as any).upsert({
    where: { superBannerId_userId: { superBannerId, userId: user.userId } },
    create: { superBannerId, userId: user.userId },
    update: {},
  })
  return NextResponse.json({ ok: true })
}

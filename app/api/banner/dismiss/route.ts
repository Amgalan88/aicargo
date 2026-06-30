import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()

  const { bannerId } = await req.json()
  if (!bannerId) return NextResponse.json({ error: 'bannerId шаардлагатай' }, { status: 400 })

  await (prisma.bannerDismiss as any).upsert({
    where: { bannerId_userId: { bannerId, userId: user.userId } },
    create: { bannerId, userId: user.userId },
    update: {},
  })
  return NextResponse.json({ ok: true })
}

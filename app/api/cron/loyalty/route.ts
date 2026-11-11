import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { refreshAutoTiers, expirePoints } from '@/lib/loyalty-db'

export const maxDuration = 60

// Өдөр бүр: VIP автомат шатыг (90 хоног, 30 хоногийн grace) дахин тооцож, 180 хоног болсон оноог EXPIRE мөрөөр бүртгэнэ
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const cargos = await prisma.loyaltySettings.findMany({ where: { vipEnabled: true }, select: { cargoId: true } })
  const tiers: Record<number, { checked: number; changed: number } | { error: string }> = {}
  for (const { cargoId } of cargos) {
    tiers[cargoId] = await refreshAutoTiers(prisma, cargoId).catch(e => ({ error: e instanceof Error ? e.message : 'алдаа' }))
  }
  const expired = await expirePoints(prisma)
  return NextResponse.json({ ok: true, tiers, expired })
}

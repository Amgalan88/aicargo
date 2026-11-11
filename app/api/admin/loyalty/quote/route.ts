import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { quoteHandover } from '@/lib/loyalty-db'
import { parseRedeem, parseShipmentIds, planJson } from '@/lib/loyalty-http'

// POST /api/admin/loyalty/quote { shipmentIds, redeem? } — олгохын өмнө хөнгөлөлт, оноо, төлөх дүнг харуулна. Юу ч бичихгүй
export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const body = await req.json().catch(() => ({}))
  const ids = parseShipmentIds(body.shipmentIds)
  if (!ids.length) return NextResponse.json({ error: 'Бараа сонгоно уу' }, { status: 400 })
  const q = await quoteHandover(prisma, admin.cargoId!, ids, parseRedeem(body.redeem))
  return NextResponse.json({
    active: q.config.vipEnabled || q.config.pointsEnabled || q.plans.some(p => p.points),
    vipEnabled: q.config.vipEnabled,
    pointsEnabled: q.config.pointsEnabled,
    count: q.count,
    groups: q.plans.map(planJson),
    totals: q.totals,
  })
}

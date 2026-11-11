import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { quoteHandover, cleanIds, cleanRedeem } from '@/lib/loyalty'

// POST /api/admin/handover/quote { shipmentIds, redeem: { [phone]: points } } — бичихгүй урьдчилсан тооцоо:
// утас бүрийн нийт, VIP хөнгөлөлт, онооны үлдэгдэл/ашиглах дээд хэмжээ, төлөх дүн, олгосны дараа нэмэгдэх оноо
export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  const body = await req.json().catch(() => ({}))
  const ids = cleanIds(body?.shipmentIds)
  if (!ids.length) return NextResponse.json({ enabled: { points: false, vip: false }, groups: [] })
  const me = await prisma.user.findUnique({ where: { id: admin.userId }, select: { phone: true } })
  const q = await quoteHandover(prisma, {
    cargoId: admin.cargoId!, actor: { id: admin.userId, name: admin.name, phone: me?.phone ?? null },
    shipmentIds: ids, redeem: cleanRedeem(body.redeem),
  })
  return NextResponse.json(q)
}

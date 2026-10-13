import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

// GET /api/admin/link-orders/latest?after=<id> — шинээр ирсэн линк захиалга (админы баруун дээд мэдэгдэлд).
// ?init=1 — зөвхөн хамгийн сүүлийн id-г буцаана (эхлэх цэг) — өмнө ирснийг дахин мэдэгдэхгүй
export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' || !admin.cargoId) return forbidden()

  const after = Number(req.nextUrl.searchParams.get('after'))
  if (req.nextUrl.searchParams.get('init') || !Number.isFinite(after) || after < 0) {
    const last = await prisma.linkOrder.findFirst({ where: { cargoId: admin.cargoId }, orderBy: { id: 'desc' }, select: { id: true } })
    return NextResponse.json({ latestId: last?.id ?? 0, items: [] })
  }
  const items = await prisma.linkOrder.findMany({
    where: { cargoId: admin.cargoId, id: { gt: after }, status: 'NEW' },
    orderBy: { id: 'desc' },
    take: 50,
    select: { id: true, name: true, phone: true, quantity: true },
  })
  return NextResponse.json({ latestId: items[0]?.id ?? after, items })
}

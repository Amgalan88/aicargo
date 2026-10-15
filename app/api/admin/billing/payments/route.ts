import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { settleBylInvoice } from '@/lib/billing-pay'
import { bylConfigured } from '@/lib/byl'

// GET /api/admin/billing/payments — төлбөрийн түүх. ?check=1 — төлөгдөөгүй сүүлийн нэхэмжлэхүүдийг Byl-ээс шалгаж,
// төлөгдсөн бол сунгана (webhook хоцорсон үед админ буцаж ирэхэд ажиллана)
export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' || !admin.cargoId) return forbidden()

  let renewed = false
  if (req.nextUrl.searchParams.get('check') && bylConfigured()) {
    const pending = await prisma.billingPayment.findMany({
      where: { cargoId: admin.cargoId, status: 'PENDING', bylInvoiceId: { not: null }, createdAt: { gt: new Date(Date.now() - 3 * 86_400_000) } },
      orderBy: { id: 'desc' }, take: 5,
    })
    for (const p of pending) {
      const r = await settleBylInvoice(p.bylInvoiceId!).catch(e => { console.error('byl check', e); return null })
      if (r === 'renewed') renewed = true
    }
  }

  const [items, cargo] = await Promise.all([
    prisma.billingPayment.findMany({
      where: { cargoId: admin.cargoId, OR: [{ status: 'PAID' }, { createdAt: { gt: new Date(Date.now() - 3 * 86_400_000) } }] },
      orderBy: { id: 'desc' }, take: 24,
      select: { id: true, periods: true, amount: true, status: true, url: true, createdAt: true, paidAt: true, paidUntilAfter: true, createdByName: true },
    }),
    prisma.cargo.findUnique({ where: { id: admin.cargoId }, select: { paidUntil: true } }),
  ])
  return NextResponse.json({ items, renewed, paidUntil: cargo?.paidUntil ?? null, online: bylConfigured() })
}

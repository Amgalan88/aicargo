import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { createInvoice, bylConfigured } from '@/lib/byl'
import { PRICE_PER_PERIOD, PERIOD_DAYS } from '@/lib/billing'

const PERIODS = [1, 3, 6, 12]

// POST /api/admin/billing/pay { periods } — Byl-д нэхэмжлэх үүсгээд төлбөрийн хуудасны холбоосыг буцаана.
// Хаагдсан карго ч дуудаж болно (хаалтын цонхноос шууд төлнө)
export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' || !admin.cargoId) return forbidden()
  if (!bylConfigured()) return NextResponse.json({ error: 'Онлайн төлбөр түр ажиллахгүй байна. Дансаар шилжүүлнэ үү' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const periods = Number(body.periods)
  if (!PERIODS.includes(periods)) return NextResponse.json({ error: 'Сарын тоо буруу' }, { status: 400 })

  const cargo = await prisma.cargo.findUnique({ where: { id: admin.cargoId }, select: { name: true, slug: true } })
  if (!cargo) return NextResponse.json({ error: 'Карго олдсонгүй' }, { status: 404 })

  // Ижил сарын тоотой, саяхан үүсгэсэн төлөгдөөгүй нэхэмжлэх байвал түүнийг дахин ашиглана (олон дарвал олон нэхэмжлэх үүсэхгүй)
  const recent = await prisma.billingPayment.findFirst({
    where: { cargoId: admin.cargoId, periods, status: 'PENDING', url: { not: null }, createdAt: { gt: new Date(Date.now() - 12 * 3600_000) } },
    orderBy: { id: 'desc' },
  })
  if (recent?.url) return NextResponse.json({ url: recent.url, id: recent.id })

  const amount = periods * PRICE_PER_PERIOD
  const row = await prisma.billingPayment.create({
    data: { cargoId: admin.cargoId, periods, amount, createdById: admin.userId, createdByName: admin.name },
  })
  try {
    const inv = await createInvoice({
      amount,
      description: `AiCargo вэбсайт · ${cargo.name} (${cargo.slug}.aicargo.mn) · ${periods} сар (${periods * PERIOD_DAYS} хоног)`,
      clientReferenceId: `aicargo-bp-${row.id}`,
      dueDate: new Date(Date.now() + 2 * 86_400_000),
    })
    await prisma.billingPayment.update({ where: { id: row.id }, data: { bylInvoiceId: inv.id, url: inv.url } })
    return NextResponse.json({ url: inv.url, id: row.id })
  } catch (e) {
    console.error('byl create invoice', e)
    await prisma.billingPayment.delete({ where: { id: row.id } }).catch(() => {})
    return NextResponse.json({ error: 'Нэхэмжлэх үүсгэж чадсангүй. Дахин оролдоно уу' }, { status: 502 })
  }
}

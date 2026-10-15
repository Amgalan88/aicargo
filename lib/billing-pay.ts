import { prisma } from '@/lib/prisma'
import { getInvoice } from '@/lib/byl'
import { renewedUntil, formatBillingDate, PERIOD_DAYS, PRICE_PER_PERIOD } from '@/lib/billing'

// Byl-ийн нэхэмжлэх төлөгдсөн бол каргогийн хугацааг НЭГ л удаа сунгана.
// Webhook, "Төлбөр шалгах" хоёулаа энийг дуудна — аль нь түрүүлсэн нь сунгаж, нөгөө нь юу ч хийхгүй.
// Byl-ээс нэхэмжлэхийг дахин татаж төлөв, дүнг шалгадаг тул webhook хуурамчаар ирсэн ч сунгахгүй.

export type SettleResult = 'renewed' | 'already' | 'unpaid' | 'unknown' | 'mismatch'

export async function settleBylInvoice(invoiceId: number): Promise<SettleResult> {
  const payment = await prisma.billingPayment.findUnique({ where: { bylInvoiceId: invoiceId } })
  if (!payment) return 'unknown'
  if (payment.status === 'PAID') return 'already'

  const inv = await getInvoice(invoiceId)
  if (inv.status !== 'paid') return 'unpaid'
  if (Math.round(Number(inv.amount)) !== Math.round(Number(payment.amount))) {
    console.error('byl amount mismatch', invoiceId, inv.amount, payment.amount)
    return 'mismatch'
  }

  const paidOn = new Date(inv.updated_at || Date.now())
  return prisma.$transaction(async tx => {
    // Зэрэг ирсэн хоёр дуудлагаас нэг л нь PENDING → PAID болгож чадна
    const claim = await tx.billingPayment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'PAID', paidAt: paidOn } })
    if (claim.count !== 1) return 'already' as const

    const cargo = await tx.cargo.findUnique({ where: { id: payment.cargoId }, select: { paidUntil: true } })
    const until = renewedUntil(cargo?.paidUntil, payment.periods, paidOn)
    await tx.cargo.update({ where: { id: payment.cargoId }, data: { paidUntil: until } })
    await tx.billingPayment.update({ where: { id: payment.id }, data: { paidUntilBefore: cargo?.paidUntil ?? null, paidUntilAfter: until } })
    await tx.adminAuditLog.create({
      data: {
        cargoId: payment.cargoId,
        userId: payment.createdById ?? 0,
        userName: payment.createdByName ?? 'Byl',
        action: 'billing:renewed',
        detail: `Byl #${invoiceId} · ${(payment.periods * PRICE_PER_PERIOD).toLocaleString('en-US')}₮ · ${payment.periods * PERIOD_DAYS} хоног · ${cargo?.paidUntil ? formatBillingDate(cargo.paidUntil) : '—'} → ${formatBillingDate(until)}`,
      },
    })
    return 'renewed' as const
  })
}

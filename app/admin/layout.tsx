import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import AdminShell from './AdminShell'
import PhoneGate from './PhoneGate'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) redirect('/login')
  if (user.phoneGate) {
    const c = user.cargoId ? await prisma.cargo.findUnique({ where: { id: user.cargoId }, select: { name: true } }) : null
    return <PhoneGate cargoName={c?.name ?? ''} />
  }

  let cargoName = ''
  let logoUrl = ''
  let cargoSlug = ''
  let hasGroup = false
  let paidUntil: string | null = null
  let batchEnabled = false
  let linkOrders = false
  let onboarding: { addressDone: boolean; shipmentDone: boolean; usersDone: boolean } | null = null
  if (user.cargoId) {
    const cargo = await (prisma.cargo.findUnique as any)({ where: { id: user.cargoId }, select: { name: true, logoUrl: true, slug: true, groupId: true, paidUntil: true, batchEnabled: true, linkOrdersEnabled: true, createdAt: true, ereemReceiver: true, ereemPhone: true, ereemAddress: true } })
    cargoName = cargo?.name ?? ''
    logoUrl = cargo?.logoUrl ?? ''
    cargoSlug = cargo?.slug ?? ''
    hasGroup = !!cargo?.groupId
    paidUntil = cargo?.paidUntil ? cargo.paidUntil.toISOString() : null
    batchEnabled = !!cargo?.batchEnabled
    linkOrders = !!cargo?.linkOrdersEnabled

    // Onboarding чеклист — зөвхөн сүүлийн 60 хоногт үүссэн каргод (хуучин каргод нэмэлт query байхгүй)
    const isNew = cargo?.createdAt && Date.now() - new Date(cargo.createdAt).getTime() < 60 * 86_400_000
    if (isNew) {
      const [shipmentCount, userCount] = await Promise.all([
        prisma.shipment.count({ where: { cargoId: user.cargoId } }),
        prisma.user.count({ where: { cargoId: user.cargoId, role: 'USER' } }),
      ])
      onboarding = {
        addressDone: !!(cargo.ereemReceiver?.trim() && cargo.ereemAddress?.trim()),
        shipmentDone: shipmentCount > 0,
        usersDone: userCount > 0,
      }
    }
  }

  return <AdminShell cargoName={cargoName} logoUrl={logoUrl} cargoSlug={cargoSlug} hasGroup={hasGroup} paidUntil={paidUntil} batchEnabled={batchEnabled} onboarding={onboarding} isStaffAdmin={!!user.isStaffAdmin} linkOrders={linkOrders}>{children}</AdminShell>
}

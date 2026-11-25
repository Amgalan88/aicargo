import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import AdminShell from './AdminShell'
import { ADMIN_ASSISTANT_ENABLED } from '@/lib/ai-feature-flag'
import { anthropicConfigured } from '@/lib/anthropic'
import { ownedCargos, type OwnedCargo } from '@/lib/multi-cargo'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) redirect('/login')

  let cargoName = ''
  let logoUrl = ''
  let cargoSlug = ''
  let hasGroup = false
  let paidUntil: string | null = null
  let batchEnabled = false
  let linkOrders = false
  let dispatchEnabled = false
  let promoEnabled = false
  let assistantEnabled = false
  // Нэг эзэмшигч — олон карго: өөр карго эзэмшдэг бол дээд цэсэнд солих товч (ажилтанд хамаарахгүй)
  let myCargos: OwnedCargo[] = []
  let onboarding: { addressDone: boolean; shipmentDone: boolean; usersDone: boolean } | null = null
  if (user.cargoId) {
    const cargo = await (prisma.cargo.findUnique as any)({ where: { id: user.cargoId }, select: { name: true, logoUrl: true, slug: true, groupId: true, paidUntil: true, batchEnabled: true, linkOrdersEnabled: true, dispatchEnabled: true, promoEnabled: true, assistantEnabled: true, createdAt: true, ereemReceiver: true, ereemPhone: true, ereemAddress: true } })
    cargoName = cargo?.name ?? ''
    logoUrl = cargo?.logoUrl ?? ''
    cargoSlug = cargo?.slug ?? ''
    hasGroup = !!cargo?.groupId
    paidUntil = cargo?.paidUntil ? cargo.paidUntil.toISOString() : null
    batchEnabled = !!cargo?.batchEnabled
    linkOrders = !!cargo?.linkOrdersEnabled
    dispatchEnabled = !!cargo?.dispatchEnabled
    promoEnabled = !!cargo?.promoEnabled
    if (user.role === 'ADMIN' && !user.isStaffAdmin) {
      const home = await prisma.user.findUnique({ where: { id: user.userId }, select: { cargoId: true, _count: { select: { ownedCargos: true } } } })
      if (home && (home._count.ownedCargos > 0 || home.cargoId !== user.cargoId)) myCargos = await ownedCargos(user.userId, home.cargoId)
    }
    assistantEnabled = ADMIN_ASSISTANT_ENABLED && user.role === 'ADMIN' && !!cargo?.assistantEnabled

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

  return <AdminShell cargoName={cargoName} logoUrl={logoUrl} cargoSlug={cargoSlug} hasGroup={hasGroup} paidUntil={paidUntil} batchEnabled={batchEnabled} onboarding={onboarding} isStaffAdmin={!!user.isStaffAdmin} linkOrders={linkOrders} dispatchEnabled={dispatchEnabled} promoEnabled={promoEnabled} myCargos={myCargos} assistant={assistantEnabled ? { userId: user.userId, isOwner: !user.isStaffAdmin, ai: anthropicConfigured() } : null}>{children}</AdminShell>
}

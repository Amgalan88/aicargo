import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import AdminShell from './AdminShell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) redirect('/login')

  let cargoName = ''
  let logoUrl = ''
  let cargoSlug = ''
  let hasGroup = false
  let paidUntil: string | null = null
  let batchEnabled = false
  if (user.cargoId) {
    const cargo = await (prisma.cargo.findUnique as any)({ where: { id: user.cargoId }, select: { name: true, logoUrl: true, slug: true, groupId: true, paidUntil: true, batchEnabled: true } })
    cargoName = cargo?.name ?? ''
    logoUrl = cargo?.logoUrl ?? ''
    cargoSlug = cargo?.slug ?? ''
    hasGroup = !!cargo?.groupId
    paidUntil = cargo?.paidUntil ? cargo.paidUntil.toISOString() : null
    batchEnabled = !!cargo?.batchEnabled
  }

  return <AdminShell cargoName={cargoName} logoUrl={logoUrl} cargoSlug={cargoSlug} hasGroup={hasGroup} paidUntil={paidUntil} batchEnabled={batchEnabled}>{children}</AdminShell>
}

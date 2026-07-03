import { getAuthUser } from '@/lib/auth'
import { getCargoFromSubdomain } from '@/lib/cargo-context'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import LandingClient from './LandingClient'
import MarketingLanding from './MarketingLanding'

export const revalidate = 0

export default async function Home() {
  const user = await getAuthUser()
  if (user) {
    if (user.role === 'SUPER_ADMIN') redirect('/super')
    if (user.role === 'ADMIN') redirect('/admin/import')
    redirect('/orders')
  }

  const cargo = await getCargoFromSubdomain()
  if (cargo) return <LandingClient cargo={cargo} />

  // Үндсэн домэйн — карго компанид зориулсан танилцуулга хуудас
  const [cargos, users, shipments] = await Promise.all([
    prisma.cargo.count(),
    prisma.user.count({ where: { role: 'USER' } }),
    prisma.shipment.count(),
  ])

  return <MarketingLanding stats={{ cargos, users, shipments }} />
}

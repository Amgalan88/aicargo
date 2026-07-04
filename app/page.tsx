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
    if (user.role === 'EREEN') redirect('/batch')
    redirect('/orders')
  }

  const cargo = await getCargoFromSubdomain()
  if (cargo) return <LandingClient cargo={cargo} />

  // Үндсэн домэйн — карго компанид зориулсан танилцуулга хуудас
  const [cargos, users, shipments, partnerCargos, warehouses] = await Promise.all([
    prisma.cargo.count(),
    prisma.user.count({ where: { role: 'USER' } }),
    prisma.shipment.count(),
    // Итгэл төрүүлэх: төлбөр идэвхтэй + логотой каргонууд
    prisma.cargo.findMany({
      where: { logoUrl: { not: null }, paidUntil: { gte: new Date() } },
      select: { id: true, name: true, logoUrl: true },
      orderBy: { id: 'asc' },
      take: 12,
    }),
    (prisma as any).partnerWarehouse.findMany({
      where: { active: true },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    }),
  ])

  return (
    <MarketingLanding
      stats={{ cargos, users, shipments }}
      partnerCargos={JSON.parse(JSON.stringify(partnerCargos))}
      warehouses={JSON.parse(JSON.stringify(warehouses))}
    />
  )
}

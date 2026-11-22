import { prisma } from '@/lib/prisma'
import { getCargoFromSubdomain } from '@/lib/cargo-context'
import RegisterClient from './RegisterClient'

export const revalidate = 0

export default async function RegisterPage() {
  const subdomain = await getCargoFromSubdomain()

  if (subdomain) {
    return <RegisterClient cargos={[subdomain]} lockedCargoId={subdomain.id} promo={!!subdomain.promoEnabled} />
  }

  const cargos = await (prisma.cargo.findMany as any)({
    select: { id: true, name: true, logoUrl: true },
    orderBy: { name: 'asc' },
  })

  return <RegisterClient cargos={cargos} />
}

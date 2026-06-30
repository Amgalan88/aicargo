import { getAuthUser } from '@/lib/auth'
import { getCargoFromSubdomain } from '@/lib/cargo-context'
import { redirect } from 'next/navigation'
import LandingClient from './LandingClient'

export const revalidate = 0

export default async function Home() {
  const user = await getAuthUser()
  if (user) {
    if (user.role === 'SUPER_ADMIN') redirect('/super')
    if (user.role === 'ADMIN') redirect('/admin/import')
    redirect('/orders')
  }

  const cargo = await getCargoFromSubdomain()
  return <LandingClient cargo={cargo} />
}

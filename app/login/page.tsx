import { getCargoFromSubdomain } from '@/lib/cargo-context'
import LoginClient from './LoginClient'

export const revalidate = 0

export default async function LoginPage() {
  const cargo = await getCargoFromSubdomain()
  return <LoginClient cargoName={cargo?.name} logoUrl={cargo?.logoUrl ?? undefined} />
}

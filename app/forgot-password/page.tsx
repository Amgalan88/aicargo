import { getCargoFromSubdomain } from '@/lib/cargo-context'
import ForgotPasswordClient from './ForgotPasswordClient'

export const revalidate = 0

export default async function ForgotPasswordPage() {
  const cargo = await getCargoFromSubdomain()
  return <ForgotPasswordClient cargoName={cargo?.name} logoUrl={cargo?.logoUrl ?? undefined} />
}

import { getCargoFromSubdomain } from '@/lib/cargo-context'
import ResetPasswordClient from './ResetPasswordClient'

export const revalidate = 0

export default async function ResetPasswordPage() {
  const cargo = await getCargoFromSubdomain()
  return <ResetPasswordClient cargoName={cargo?.name} logoUrl={cargo?.logoUrl ?? undefined} />
}

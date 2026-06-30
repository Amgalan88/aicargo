import { getCargoFromSubdomain } from '@/lib/cargo-context'
import VerifyOtpClient from './VerifyOtpClient'

export const revalidate = 0

export default async function VerifyOtpPage() {
  const cargo = await getCargoFromSubdomain()
  return <VerifyOtpClient cargoName={cargo?.name} logoUrl={cargo?.logoUrl ?? undefined} />
}

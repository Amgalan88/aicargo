import { getCargoFromSubdomain } from '@/lib/cargo-context'
import LoginClient from './LoginClient'

export const revalidate = 0

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const cargo = await getCargoFromSubdomain()
  const next = (await searchParams).next
  // Зөвхөн админы дотоод хуудас руу буцаана — гадны хаяг руу чиглүүлэхгүй
  const adminNext = next && /^\/admin\/[A-Za-z0-9/_\-?=&]*$/.test(next) ? next : undefined
  return <LoginClient cargoName={cargo?.name} logoUrl={cargo?.logoUrl ?? undefined} adminNext={adminNext} />
}

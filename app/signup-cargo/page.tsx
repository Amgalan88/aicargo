import SignupCargoClient, { ContractOffer } from './SignupCargoClient'
import { findSignupContract, safeValues } from '@/lib/contract-server'
import { WEBSITE_BONUS_DAYS } from '@/lib/contract'

export const revalidate = 0
export const metadata = { title: 'Шинэ карго нээх — Aicargo', robots: { index: true } }

// ?contract=<token> — Эрээний агуулахтай гэрээ байгуулсан хүнд 60 хоногийн үнэгүй санал
export default async function SignupCargoPage({ searchParams }: { searchParams: Promise<{ contract?: string }> }) {
  const token = (await searchParams).contract
  let offer: ContractOffer | null = null
  let offerInvalid = false
  if (token) {
    const c = await findSignupContract(token)
    if (c?.guestEmail) {
      const v = safeValues(c.values)
      offer = {
        token,
        contractNo: c.contractNo,
        warehouseName: c.warehouse.name,
        email: c.guestEmail,
        cargoName: (v.cargoLegalName ?? '').replace(/\s*(ХХК|LLC)$/i, ''),
        adminName: [v.repLastName, v.repFirstName].filter(Boolean).join(' '),
        phone: (v.repPhone ?? '').replace(/\D/g, '').slice(-8),
        days: WEBSITE_BONUS_DAYS,
      }
    } else {
      offerInvalid = true
    }
  }
  return <SignupCargoClient offer={offer} offerInvalid={offerInvalid} />
}

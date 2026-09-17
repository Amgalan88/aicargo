import Link from 'next/link'
import NavLogo from '@/app/components/NavLogo'
import GuestContract from './GuestContract'

export const metadata = { title: 'Агуулахын гэрээ — Aicargo', robots: { index: false, follow: false }, referrer: 'no-referrer' as const }

// Нэвтрэлтгүй гэрээ — нууц холбоос нь хандах эрх; хуудас хайлтын системд орохгүй
export default async function GuestContractPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <>
      <nav className="nav"><Link href="/"><NavLogo /></Link></nav>
      <div style={{ padding: '1.5rem 5% 3rem' }}>
        <GuestContract token={token} />
      </div>
    </>
  )
}

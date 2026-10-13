import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import NavLogo from '@/app/components/NavLogo'
import LinksClient from './LinksClient'

export const metadata = { title: 'Линкээр захиалах' }

// Хэрэглэгч: барааны линкээ илгээж, үнэ, төлбөр, захиалгын явцаа харна
export default async function LinksPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const [cargo, me] = await Promise.all([
    user.cargoId
      ? prisma.cargo.findUnique({
          where: { id: user.cargoId },
          select: { name: true, logoUrl: true, linkOrdersEnabled: true, bankName: true, bankAccountHolder: true, bankAccountNumber: true, bankTransferNote: true },
        })
      : null,
    prisma.user.findUnique({ where: { id: user.userId }, select: { phone: true } }),
  ])

  return (
    <>
      <nav className="nav">
        <Link href="/orders" style={{ minWidth: 0, overflow: 'hidden' }}><NavLogo name={cargo?.name || undefined} logoUrl={cargo?.logoUrl || undefined} /></Link>
        <div className="nav-links"><Link href="/orders">← Миний ачаа</Link></div>
      </nav>
      {!cargo?.linkOrdersEnabled ? (
        <div className="page" style={{ maxWidth: 520 }}>
          <div className="empty-state">
            <h3>Линкээр захиалга авдаггүй</h3>
            <p>Танай карго одоогоор линкээр захиалга авахгүй байна. Карготойгоо холбогдоно уу.</p>
            <Link href="/orders" className="btn" style={{ textDecoration: 'none' }}>Миний ачаа руу буцах</Link>
          </div>
        </div>
      ) : (
        <LinksClient
          phone={me?.phone ?? ''}
          bank={{
            name: cargo.bankName ?? '',
            holder: cargo.bankAccountHolder ?? '',
            account: cargo.bankAccountNumber ?? '',
            note: cargo.bankTransferNote ?? '',
          }}
        />
      )}
    </>
  )
}

import { getAuthUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SuperNav from './SuperNav'

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user || user.role !== 'SUPER_ADMIN') redirect('/login')
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <SuperNav />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 5%' }}>
        {children}
      </div>
    </div>
  )
}

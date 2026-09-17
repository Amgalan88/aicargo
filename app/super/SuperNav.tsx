'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import NavLogo from '@/app/components/NavLogo'

const links = [
  { href: '/super', label: 'Карго жагсаалт' },
  { href: '/super/groups', label: 'Группүүд' },
  { href: '/super/cross-cargo', label: 'Карго зөрүү' },
  { href: '/super/announce', label: 'Мэдэгдэл' },
  { href: '/super/warehouses', label: 'Агуулахууд' },
  { href: '/super/contracts', label: 'Агуулахын гэрээ' },
  { href: '/super/ai-config', label: 'AI Тохиргоо' },
  { href: '/super/cargo/new', label: '+ Шинэ карго' },
]

export default function SuperNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [pendingContracts, setPendingContracts] = useState(0)

  useEffect(() => {
    fetch('/api/super/warehouse-contracts?count=pending')
      .then(r => r.ok ? r.json() : null)
      .then(d => setPendingContracts(d?.count ?? 0))
      .catch(() => {})
  }, [pathname])

  useEffect(() => {
    const orig = window.fetch
    window.fetch = async (...args) => {
      const res = await orig(...args)
      if (res.status === 401) router.push('/login')
      return res
    }
    return () => { window.fetch = orig }
  }, [router])

  async function logout() {
    if (!confirm('Гарахдаа итгэлтэй байна уу?')) return
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  return (
    <header>
      <div className="header-accent" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem 5%', minHeight: 56, boxSizing: 'border-box', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <Link href="/super"><NavLogo /></Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          <span style={{
            fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 700,
            letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
            background: 'var(--accent-light)', border: '1px solid var(--accent)',
            borderRadius: 100, padding: '0.2rem 0.6rem',
          }}>Super Admin</span>
          <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            Гарах
          </button>
        </div>
      </div>
      <nav className="admin-nav">
        {links.map(l => (
          <Link key={l.href} href={l.href} className={`admin-nav-link${pathname === l.href || ((l.href === '/super/warehouses' || l.href === '/super/contracts') && pathname.startsWith(l.href + '/')) ? ' active' : ''}`}>
            {l.label}
            {l.href === '/super/contracts' && pendingContracts > 0 && (
              <span style={{ marginLeft: 5, background: 'var(--accent)', color: '#fff', borderRadius: 100, fontSize: '0.65rem', fontWeight: 700, padding: '0.05rem 0.4rem' }}>{pendingContracts}</span>
            )}
          </Link>
        ))}
      </nav>
    </header>
  )
}

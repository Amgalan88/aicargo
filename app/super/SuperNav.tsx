'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import NavLogo from '@/app/components/NavLogo'

const links = [
  { href: '/super', label: 'Карго жагсаалт' },
  { href: '/super/groups', label: 'Группүүд' },
  { href: '/super/cross-cargo', label: '⚠ Карго зөрүү' },
  { href: '/super/announce', label: '📢 Мэдэгдэл' },
  { href: '/super/cargo/new', label: '+ Шинэ карго' },
]

export default function SuperNav() {
  const pathname = usePathname()
  const router = useRouter()

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem 5%', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <Link href="/super"><NavLogo /></Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Super Admin</span>
          <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit' }}>
            Гарах
          </button>
        </div>
      </div>
      <nav className="admin-nav">
        {links.map(l => (
          <Link key={l.href} href={l.href} className={`admin-nav-link${pathname === l.href ? ' active' : ''}`}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}

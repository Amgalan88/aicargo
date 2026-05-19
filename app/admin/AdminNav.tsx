'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import NavLogo from '@/app/components/NavLogo'

function getPaidBadge(paidUntil?: string | null): { label: string; color: string } | null {
  if (!paidUntil) return null
  const days = Math.floor((new Date(paidUntil).getTime() - Date.now()) / 86400000)
  const d = new Date(paidUntil)
  const label = `${d.getMonth() + 1}/${d.getDate()}`
  if (days < 0) return { label: `Төлбөр дууссан`, color: '#ef4444' }
  if (days < 7) return { label: `Төлбөр: ${label} (${days}хоног)`, color: '#f97316' }
  if (days < 30) return { label: `Төлбөр: ${label} хүртэл`, color: '#eab308' }
  return { label: `Төлбөр: ${label} хүртэл`, color: '#22c55e' }
}

export default function AdminNav({
  cargoName,
  logoUrl,
  cargoSlug,
  hasGroup,
  paidUntil,
}: {
  cargoName?: string
  logoUrl?: string
  cargoSlug?: string
  hasGroup?: boolean
  paidUntil?: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [unread, setUnread] = useState(0)
  const [arrivedLabel, setArrivedLabel] = useState<string | null>(null)
  const [ereemLabel, setEreemLabel] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/notifications?count=1')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.count) setUnread(d.count) })
      .catch(() => {})
    fetch('/api/admin/settings')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.arrivedLabel) setArrivedLabel(d.arrivedLabel); if (d?.ereemLabel) setEreemLabel(d.ereemLabel) })
      .catch(() => {})
  }, [pathname])

  const links = [
    { href: '/admin/registered', label: 'Бүртгүүлсэн' },
    { href: '/admin/import', label: ereemLabel || 'Эрээнд ирсэн' },
    { href: '/admin/arrived', label: arrivedLabel || 'Ирсэн' },
    { href: '/admin/handover', label: 'Ачаа олгох' },
    { href: '/admin/history', label: 'Олгосон' },
    ...(hasGroup ? [{ href: '/admin/group-search', label: '🔍 Групп хайлт' }] : []),
    { href: '/admin/notify', label: 'Мэдэгдэл' },
    { href: '/admin/faq', label: 'FAQ' },
    { href: '/admin/users', label: 'Хэрэглэгчид' },
    { href: '/admin/settings', label: 'Тохиргоо' },
  ]

  function copyInvite() {
    if (!cargoSlug) return
    navigator.clipboard.writeText(`https://${cargoSlug}.aicargo.mn`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function logout() {
    if (!confirm('Гарахдаа итгэлтэй байна уу?')) return
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  return (
    <header>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem 5%', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link href="/admin/import"><NavLogo name={cargoName} logoUrl={logoUrl} /></Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {(() => { const b = getPaidBadge(paidUntil); return b ? (
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: b.color, background: `${b.color}18`, border: `1px solid ${b.color}55`, borderRadius: 100, padding: '0.2rem 0.65rem', whiteSpace: 'nowrap' }}>
              {b.label}
            </span>
          ) : null })()}
          <Link href="/admin/notifications" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', color: 'var(--muted)', textDecoration: 'none', fontSize: '1.1rem' }}>
            🔔
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -6,
                background: 'var(--accent)', color: '#fff',
                borderRadius: '100px', fontSize: '0.6rem', fontWeight: 700,
                padding: '0.05rem 0.32rem', lineHeight: 1.4, minWidth: '1rem', textAlign: 'center',
              }}>{unread > 99 ? '99+' : unread}</span>
            )}
          </Link>
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
        {cargoSlug && (
          <button onClick={copyInvite} className="admin-nav-link" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: copied ? 'var(--accent)' : 'var(--muted)',
            fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>
            {copied ? '✓ Хуулагдлаа' : '🔗 Урилга'}
          </button>
        )}
      </nav>
    </header>
  )
}

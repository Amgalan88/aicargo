'use client'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  ClipboardList, PackageOpen, PackageCheck, HandCoins, History, Truck,
  Users, Megaphone, CircleHelp, Warehouse, Settings, Sparkles, ScrollText, SearchCheck,
  Bell, LogOut, Link2, Check, CalendarClock, Ellipsis, ChevronDown, X,
  type LucideIcon,
} from 'lucide-react'
import NavLogo from '@/app/components/NavLogo'
import ThemeToggle from '@/app/components/ThemeToggle'
import { confirmAsync } from '@/app/components/ConfirmDialog'

type NavLink = { href: string; label: string; short?: string; icon: LucideIcon; count?: number }

type Counts = { registered: number; ereen: number; arrived: number; batchesShipped: number; batchesArrived: number }

// Төлбөрийн хугацааны өнгө — token-оор (шөнийн горимд зохицно)
function paidInfo(paidUntil?: string | null) {
  if (!paidUntil) return null
  const d = new Date(paidUntil)
  const days = Math.floor((d.getTime() - Date.now()) / 86400000)
  const color = days < 0 ? 'var(--danger)' : days < 7 ? 'var(--orange)' : days < 30 ? 'var(--yellow)' : 'var(--green)'
  return { days, color, date: `${d.getMonth() + 1} сарын ${d.getDate()}`, short: `${d.getMonth() + 1}/${d.getDate()}` }
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

export default function AdminNav({
  cargoName,
  logoUrl,
  cargoSlug,
  hasGroup,
  paidUntil,
  batchEnabled,
  isStaffAdmin,
}: {
  cargoName?: string
  logoUrl?: string
  cargoSlug?: string
  hasGroup?: boolean
  paidUntil?: string | null
  batchEnabled?: boolean
  isStaffAdmin?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [unread, setUnread] = useState(0)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [arrivedLabel, setArrivedLabel] = useState<string | null>(null)
  const [ereemLabel, setEreemLabel] = useState<string | null>(null)
  const [paidOpen, setPaidOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/admin/notifications?count=1')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.count !== undefined) setUnread(d.count) })
      .catch(() => {})
    fetch('/api/admin/counts')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCounts(d) })
      .catch(() => {})
    setMoreOpen(false)
    setSheetOpen(false)
    setPaidOpen(false)
  }, [pathname])

  // Каргогийн өөрийн шошго — хуудас солигдох бүрт болон Тохиргоо хадгалагдмагц дахин татна.
  // Хоосолсон бол (null) анхдагч нэр рүү буцна.
  useEffect(() => {
    function loadLabels() {
      fetch('/api/admin/settings')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) { setArrivedLabel(d.arrivedLabel || null); setEreemLabel(d.ereemLabel || null) } })
        .catch(() => {})
    }
    loadLabels()
    window.addEventListener('admin-settings-saved', loadLabels)
    return () => window.removeEventListener('admin-settings-saved', loadLabels)
  }, [pathname])

  // "Бусад" цэсийг гадна дарахад хаана
  useEffect(() => {
    if (!moreOpen) return
    function onDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMoreOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [moreOpen])

  // Үндсэн ажлын урсгал — ачааны амьдралын мөчлөгийн дарааллаар
  // Батч горимт карго: Эрээн/Ирсэн шатгүй — Бүртгүүлсэн → УБ руу ачигдсан → Олгох → Олгосон
  const flow: NavLink[] = batchEnabled
    ? [
        { href: '/admin/registered', label: 'Бүртгүүлсэн', short: 'Бүртгэл', icon: ClipboardList, count: counts?.registered },
        { href: '/admin/batches', label: arrivedLabel || 'УБ руу ачигдсан', short: 'Ачигдсан', icon: Truck, count: counts?.batchesShipped },
        { href: '/admin/batch-handover', label: 'Ачаа олгох', short: 'Олгох', icon: HandCoins, count: counts?.batchesArrived },
        { href: '/admin/history', label: 'Олгосон', short: 'Олгосон', icon: History },
      ]
    : [
        { href: '/admin/registered', label: 'Бүртгүүлсэн', short: 'Бүртгэл', icon: ClipboardList, count: counts?.registered },
        { href: '/admin/import', label: ereemLabel || 'Эрээнд ирсэн', short: 'Эрээн', icon: PackageOpen, count: counts?.ereen },
        { href: '/admin/arrived', label: arrivedLabel || 'Ирсэн', short: 'Ирсэн', icon: PackageCheck },
        { href: '/admin/handover', label: 'Ачаа олгох', short: 'Олгох', icon: HandCoins, count: counts?.arrived },
        { href: '/admin/history', label: 'Олгосон', short: 'Олгосон', icon: History },
      ]

  // Хоёрдогч — өдөр тутам бага хэрэглэгдэх хэсгүүд
  const primaryExtra: NavLink[] = [
    { href: '/admin/users', label: 'Хэрэглэгчид', icon: Users },
    { href: '/admin/notify', label: 'Мэдэгдэл', icon: Megaphone },
  ]
  const more: NavLink[] = [
    ...(hasGroup ? [{ href: '/admin/group-search', label: 'Групп хайлт', icon: SearchCheck }] : []),
    { href: '/admin/warehouse', label: 'Агуулах', icon: Warehouse },
    { href: '/admin/ai', label: 'AI туслах', icon: Sparkles },
    { href: '/admin/faq', label: 'FAQ', icon: CircleHelp },
    { href: '/admin/settings', label: 'Тохиргоо', icon: Settings },
    ...(!isStaffAdmin ? [{ href: '/admin/audit-log', label: 'Аудит лог', icon: ScrollText }] : []),
  ]
  const activeMore = more.find(l => isActive(pathname, l.href))
  const activeExtra = primaryExtra.some(l => isActive(pathname, l.href))

  // Утасны доод таб: урсгалын сүүлийн 4 (өдөр тутмын үйлдэл) + "Цэс"
  const mobileTabs = batchEnabled ? flow : flow.slice(1)

  function copyInvite() {
    if (!cargoSlug) return
    navigator.clipboard.writeText(`https://${cargoSlug}.aicargo.mn`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function logout() {
    if (!await confirmAsync({ title: 'Гарахдаа итгэлтэй байна уу?', confirmLabel: 'Гарах', danger: false })) return
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  const paid = paidInfo(paidUntil)

  return (
    <header className="an">
      <div className="an-top header-accent">
        <Link href={batchEnabled ? '/admin/batches' : '/admin/import'} className="an-logo">
          <NavLogo name={cargoName} logoUrl={logoUrl} />
        </Link>
        <div className="an-actions">
          {paid && (
            <div style={{ position: 'relative' }}>
              <button
                className="an-paid"
                onClick={() => setPaidOpen(o => !o)}
                aria-expanded={paidOpen}
                style={{ ['--c' as string]: paid.color }}
                title="Вэбсайтын төлбөрийн хугацаа"
              >
                <CalendarClock size={15} strokeWidth={2.2} />
                <span className="an-paid-text">{paid.days < 0 ? 'Төлбөр дууссан' : `${paid.short} хүртэл`}</span>
              </button>
              {paidOpen && (
                <>
                  <div onClick={() => setPaidOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
                  <div className="popover" style={{ padding: '0.85rem 1rem', minWidth: 230 }}>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', lineHeight: 1.5 }}>
                      Таны вэбсайтын төлбөр<br />
                      <strong style={{ color: 'var(--text)', fontSize: 'var(--fs-base)' }}>{paid.date} хүртэл</strong> төлөгдсөн
                    </p>
                    <p style={{ marginTop: '0.35rem', fontSize: 'var(--fs-md)', fontWeight: 700, color: paid.color }}>
                      {paid.days >= 0 ? `${paid.days} өдөр үлдсэн` : `${-paid.days} өдөр хэтэрсэн`}
                    </p>
                    <Link href="/admin/billing" onClick={() => setPaidOpen(false)} className="btn" style={{ marginTop: '0.7rem', width: '100%', padding: '0.45rem 0.8rem', fontSize: 'var(--fs-sm)' }}>
                      Сунгах · төлбөр хэрхэн тооцогдох
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}
          {cargoSlug && (
            <button className="icon-btn an-hide-sm" onClick={copyInvite} title="Хэрэглэгчдэд илгээх урилгын линк хуулах" aria-label="Урилгын линк хуулах">
              {copied ? <Check size={18} strokeWidth={2.2} style={{ color: 'var(--green)' }} /> : <Link2 size={18} strokeWidth={2} />}
            </button>
          )}
          <ThemeToggle />
          <Link href="/admin/notifications" className="icon-btn" aria-label={`Мэдэгдэл${unread ? ` (${unread} уншаагүй)` : ''}`} title="Мэдэгдэл">
            <Bell size={18} strokeWidth={2} />
            {unread > 0 && <span className="icon-btn-badge">{unread > 99 ? '99+' : unread}</span>}
          </Link>
          <button className="icon-btn" onClick={logout} title="Гарах" aria-label="Гарах">
            <LogOut size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ── Desktop / tablet цэс ── */}
      <nav className="an-nav" aria-label="Админ цэс">
        <div className="an-flow">
          {flow.map(l => {
            const on = isActive(pathname, l.href)
            const Icon = l.icon
            return (
              <Link key={l.href} href={l.href} className={`an-link${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
                <Icon size={15} strokeWidth={2.2} />
                <span className="an-lbl-full">{l.label}</span>
                <span className="an-lbl-short">{l.short ?? l.label}</span>
                {!!l.count && <span className="an-count">{l.count > 999 ? '999+' : l.count}</span>}
              </Link>
            )
          })}
        </div>
        <span className="an-sep" aria-hidden />
        {primaryExtra.map(l => {
          const on = isActive(pathname, l.href)
          const Icon = l.icon
          return (
            <Link key={l.href} href={l.href} className={`an-link an-extra${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
              <Icon size={15} strokeWidth={2.2} />{l.label}
            </Link>
          )
        })}
        <div ref={moreRef} style={{ position: 'relative' }}>
          <button className={`an-link${activeMore ? ' on' : ''}${activeExtra ? ' on-tablet' : ''}`} onClick={() => setMoreOpen(o => !o)} aria-expanded={moreOpen} aria-haspopup="menu">
            {activeMore ? <><activeMore.icon size={15} strokeWidth={2.2} />{activeMore.label}</> : <><Ellipsis size={15} strokeWidth={2.2} />Бусад</>}
            <ChevronDown size={14} strokeWidth={2.2} style={{ transition: 'transform .15s', transform: moreOpen ? 'rotate(180deg)' : 'none' }} />
          </button>
          {moreOpen && (
            <div className="popover" role="menu" style={{ left: 'auto', right: 0 }}>
              {/* Таблетад "Хэрэглэгчид/Мэдэгдэл" энд орно (CSS-ээр) */}
              {primaryExtra.map(l => {
                const Icon = l.icon
                return (
                  <Link key={l.href} href={l.href} role="menuitem" className={`popover-item an-more-extra${isActive(pathname, l.href) ? ' active' : ''}`}>
                    <Icon size={16} strokeWidth={2} />{l.label}
                  </Link>
                )
              })}
              <div className="popover-sep an-more-extra" />
              {more.map(l => {
                const Icon = l.icon
                return (
                  <Link key={l.href} href={l.href} role="menuitem" className={`popover-item${isActive(pathname, l.href) ? ' active' : ''}`}>
                    <Icon size={16} strokeWidth={2} />{l.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </nav>

      {/* ── Утасны доод таб ── */}
      <nav className="an-tabbar" aria-label="Админ цэс (утас)">
        {mobileTabs.map(l => {
          const on = isActive(pathname, l.href)
          const Icon = l.icon
          return (
            <Link key={l.href} href={l.href} className={`an-tab${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
              <span className="an-tab-icon">
                <Icon size={20} strokeWidth={on ? 2.4 : 2} />
                {!!l.count && <span className="an-tab-count">{l.count > 99 ? '99+' : l.count}</span>}
              </span>
              {l.short ?? l.label}
            </Link>
          )
        })}
        <button className={`an-tab${sheetOpen ? ' on' : ''}`} onClick={() => setSheetOpen(true)}>
          <span className="an-tab-icon"><Ellipsis size={20} strokeWidth={2} /></span>
          Цэс
        </button>
      </nav>

      {sheetOpen && (
        <div className="an-sheet-bg" onClick={() => setSheetOpen(false)}>
          <div className="an-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Цэс">
            <div className="an-sheet-head">
              <strong>Цэс</strong>
              <button className="icon-btn" onClick={() => setSheetOpen(false)} aria-label="Хаах"><X size={18} /></button>
            </div>
            <div className="an-sheet-label">Ачааны урсгал</div>
            <div className="an-sheet-grid">
              {flow.map(l => {
                const Icon = l.icon
                return (
                  <Link key={l.href} href={l.href} className={`an-sheet-item${isActive(pathname, l.href) ? ' on' : ''}`}>
                    <Icon size={18} strokeWidth={2} /><span>{l.label}</span>
                    {!!l.count && <span className="an-count">{l.count}</span>}
                  </Link>
                )
              })}
            </div>
            <div className="an-sheet-label">Удирдлага</div>
            <div className="an-sheet-grid">
              {[...primaryExtra, ...more].map(l => {
                const Icon = l.icon
                return (
                  <Link key={l.href} href={l.href} className={`an-sheet-item${isActive(pathname, l.href) ? ' on' : ''}`}>
                    <Icon size={18} strokeWidth={2} /><span>{l.label}</span>
                  </Link>
                )
              })}
              {cargoSlug && (
                <button className="an-sheet-item" onClick={copyInvite}>
                  {copied ? <Check size={18} style={{ color: 'var(--green)' }} /> : <Link2 size={18} strokeWidth={2} />}
                  <span>{copied ? 'Хуулагдлаа' : 'Урилгын линк'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

'use client'
import { Package, Boxes, Trash2, Ellipsis as MoreHorizontal, Copy, PackageCheck, ChevronRight } from 'lucide-react'
import { confirmAsync } from '@/app/components/ConfirmDialog'
import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SiteFooter from '../components/SiteFooter'
import ChatWidget from '../components/ChatWidget'
import NamelessSearch from '../components/NamelessSearch'
import PriceCalculator from '../components/PriceCalculator'
import NavLogo from '../components/NavLogo'
import AnnouncementModal from '../components/AnnouncementModal'
import SuperAnnouncementModal from '../components/SuperAnnouncementModal'
import UserAIWidget from '../components/UserAIWidget'
import ThemeToggle from '../components/ThemeToggle'
import ConfirmDialog from '../components/ConfirmDialog'
import { useUserLang } from '../components/useUserLang'
import { StaggerItem } from '../components/motion'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { dict, fmt, statusLabels, LANG_CONFIRM, UserLang, type UserDict } from '@/lib/user-i18n'


const BASE_TABS = [
  { key: 'ALL', label: 'Бүгд' },
  { key: 'REGISTERED', label: 'Бүртгүүлсэн' },
  { key: 'EREEN_ARRIVED', label: 'Эрээнд' },
  { key: 'ARRIVED', label: 'Ирсэн' },
  { key: 'PICKED_UP', label: 'Авсан' },
]

const PAGE_SIZE = 10

interface Shipment {
  id: number
  trackCode: string
  phone: string | null
  description: string | null
  status: string
  adminPrice: number | null
  adminNote: string | null
  createdAt: string
  updatedAt: string
  ereenArrivedAt?: string | null
  arrivedAt?: string | null
  batchId?: number | null
}

interface UserBatch {
  id: number
  phone: string
  price: string
  currency: 'MNT' | 'CNY'
  note?: string | null
  status: string
  createdAt: string
  shipments: { id: number; trackCode: string }[]
}

function fmtDT(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear().toString().slice(2)}.${d.getMonth()+1}.${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`
}

const STEP_ORDER = ['REGISTERED', 'EREEN_ARRIVED', 'ARRIVED', 'PICKED_UP'] as const
const STEP_COLOR: Record<string, string> = {
  REGISTERED: 'var(--muted)', EREEN_ARRIVED: 'var(--blue)', ARRIVED: 'var(--yellow)', PICKED_UP: 'var(--green)',
}

// Ачаа аль шатанд явж байгааг 4 алхамтай зурвасаар харуулна — badge-аас илүү ойлгомжтой
function ShipSteps({ status, labels }: { status: string; labels: Record<string, string> }) {
  const idx = STEP_ORDER.indexOf(status as typeof STEP_ORDER[number])
  if (idx < 0) return null
  const style = { ['--step-color' as string]: STEP_COLOR[status] } as React.CSSProperties
  return (
    <div style={style} role="img" aria-label={`${idx + 1}/4: ${labels[status] ?? status}`}>
      <div className="ship-steps">
        {STEP_ORDER.map((k, i) => <span key={k} className={`ship-step${i <= idx ? ' done' : ''}`} />)}
      </div>
      <div className="ship-steps-labels" aria-hidden>
        {STEP_ORDER.map((k, i) => <span key={k} className={i === idx ? 'cur' : ''}>{labels[k] ?? k}</span>)}
      </div>
    </div>
  )
}

// "6 хоногийн өмнө" маягийн харьцангуй хугацаа (яг огноо нь явцын зурвас дээр)
function relTime(iso: string, t: UserDict): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 2) return t.relNow
  if (min < 60) return fmt(t.relMin, { n: min })
  const h = Math.floor(min / 60)
  if (h < 24) return fmt(t.relHour, { n: h })
  const d = Math.floor(h / 24)
  if (d === 1) return t.relYesterday
  if (d < 14) return fmt(t.relDays, { n: d })
  if (d < 60) return fmt(t.relWeeks, { n: Math.floor(d / 7) })
  return fmt(t.relMonths, { n: Math.floor(d / 30) })
}

function fullDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function shortDate(iso: string) {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return sameYear ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
}

// Хэрэглэгчийн ачааны карт: гарчиг = юу болох нь (тайлбар), доор нь нэг өгүүлбэрээр хаана явааг хэлнэ.
// Төлөв нэг л удаа — цэгэн явц + хүний хэлээрх мөр. "Ирсэн" нь цорын ганц үйлдэл шаардах төлөв тул тодорно.
function ShipmentCard({ s, t, labels, cur, userPhone, deleting, onDelete }: {
  s: Shipment
  t: UserDict
  labels: Record<string, string>
  cur: string
  userPhone: string
  deleting: boolean
  onDelete: () => void
}) {
  const [menu, setMenu] = useState(false)
  const idx = STEP_ORDER.indexOf(s.status as typeof STEP_ORDER[number])
  const price = s.adminPrice ? `${cur}${Number(s.adminPrice).toLocaleString()}` : null
  const title = s.description?.trim() || s.trackCode
  const hasTitle = !!s.description?.trim()
  const canDelete = s.status === 'REGISTERED' || s.status === 'PICKED_UP' || s.status === 'EREEN_ARRIVED'
  // Шат бүрт хүрсэн огноо (2026/6-аас өмнөх ачаанд Эрээний огноо байхгүй байж болно)
  const stepDates: (string | null | undefined)[] = [
    s.createdAt,
    s.ereenArrivedAt,
    s.arrivedAt,
    s.status === 'PICKED_UP' ? s.updatedAt : null,
  ]

  let headline: React.ReactNode
  let sub: string | null = null
  if (s.status === 'REGISTERED') {
    headline = t.stWaitEreen
    sub = fmt(t.stRegistered, { r: relTime(s.createdAt, t) })
  } else if (s.status === 'EREEN_ARRIVED') {
    headline = labels.EREEN_ARRIVED
    sub = `${t.stOnWay} · ${relTime(s.ereenArrivedAt ?? s.updatedAt, t)}`
  } else if (s.status === 'ARRIVED') {
    headline = <>{labels.ARRIVED}!</>
    sub = price ? fmt(t.stPay, { p: price }) : t.stReady
  } else if (s.status === 'PICKED_UP') {
    headline = fmt(t.stPicked, { d: shortDate(s.updatedAt) })
    sub = price
  } else {
    headline = labels[s.status] ?? s.status
  }

  return (
    <article className={`sc sc-${s.status}`}>
      <div className="sc-top">
        <h3 className="sc-title">
          {hasTitle ? title : <CopyText text={s.trackCode}>{s.trackCode}</CopyText>}
        </h3>
        {canDelete && (
          <div className="sc-menu-wrap">
            <button className="sc-more" onClick={() => setMenu(m => !m)} aria-label={t.moreActions} aria-expanded={menu} disabled={deleting}>
              <MoreHorizontal size={18} />
            </button>
            {menu && (
              <>
                <div className="sc-menu-bg" onClick={() => setMenu(false)} />
                <div className="sc-menu" role="menu">
                  <button role="menuitem" onClick={() => { setMenu(false); onDelete() }}>
                    <Trash2 size={15} />{s.status === 'PICKED_UP' ? t.archiveTooltip : t.deleteTooltip}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {hasTitle && (
        <div className="sc-code">
          <CopyText text={s.trackCode}>{s.trackCode}<Copy size={12} /></CopyText>
          {s.phone && s.phone !== userPhone && <span className="sc-phone">· {s.phone}</span>}
        </div>
      )}

      {s.status !== 'PICKED_UP' && idx >= 0 && (
        <ol className="sc-track" aria-label={`${idx + 1}/4: ${labels[s.status] ?? s.status}`}>
          {STEP_ORDER.map((k, i) => {
            const d = i <= idx ? stepDates[i] : null
            return (
              <li key={k} className={`sc-step${i < idx ? ' done' : ''}${i === idx ? ' cur' : ''}`} title={d ? `${labels[k]} · ${fullDate(d)}` : labels[k]}>
                <span className="sc-bar" />
                <time dateTime={d ?? undefined}>{d ? shortDate(d) : ' '}</time>
              </li>
            )
          })}
        </ol>
      )}

      <p className="sc-status">
        <b>{headline}</b>
        {sub && <span>{sub}</span>}
      </p>

      {s.adminNote && <p className="sc-note">{t.adminNote}: {s.adminNote}</p>}
    </article>
  )
}

function CopyText({ text, children, style }: { text: string; children: React.ReactNode; style?: React.CSSProperties }) {
  function copy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    toast.success('Хуулагдлаа')
  }
  return (
    <span onClick={copy} title="Хуулах" style={{ cursor: 'pointer', ...style }}>
      {children}
    </span>
  )
}

// Nav дээрх дүрс товч тус бүрийн дор жижиг үсгээр юу болохыг тайлбарлана.
// Шошгын багана нарийн (44px) тул урт үг байсан ч дараагийн мөрөнд өөрөө
// шилждэг — өргөн дэлгэц дээр ч, нарийн утсан дээр ч мөр давахгүй.
function NavItem({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.05rem', minWidth: 44, padding: '0 2px', flexShrink: 0 }}>
      {children}
      <span className="nav-item-lbl" style={{ fontSize: '0.6rem', color: 'var(--muted)', lineHeight: 1.15, textAlign: 'center' }}>{label}</span>
    </div>
  )
}

export default function OrdersClient({
  shipments: initialShipments,
  userName,
  userEmail,
  userPhone,
  cargoName,
  logoUrl,
  ereemReceiver,
  ereemPhone,
  ereemRegion,
  ereemAddress,
  tariff,
  priceCubic = null,
  priceWeight = null,
  priceWeightUnit = 'kg',
  priceWeightTiers = [],
  announcement,
  contactInfo,
  bankName,
  bankAccountHolder,
  bankAccountNumber,
  bankTransferNote,
  arrivedLabel,
  ereemLabel,
  aiEnabled,
  batchMode = false,
  batches = [],
  aiSuggestions = [],
}: {
  shipments: Shipment[]
  userName: string
  userEmail: string | null
  userPhone: string
  cargoName: string
  logoUrl?: string
  ereemReceiver: string
  ereemPhone: string
  ereemRegion?: string
  ereemAddress: string
  tariff?: string | null
  priceCubic?: number | null
  priceWeight?: number | null
  priceWeightUnit?: string
  priceWeightTiers?: { min: number; price: number }[]
  announcement?: string | null
  contactInfo?: string | null
  bankName?: string | null
  bankAccountHolder?: string | null
  bankAccountNumber?: string | null
  bankTransferNote?: string | null
  arrivedLabel?: string | null
  ereemLabel?: string | null
  aiEnabled?: boolean
  batchMode?: boolean
  batches?: UserBatch[]
  aiSuggestions?: string[]
}) {
  const router = useRouter()
  const [lang, setLang] = useUserLang()
  const t = dict(lang)
  // Батч горимд: Эрээний шат нуугдаж, ARRIVED нь "УБ руу ачигдсан" нэртэй болно.
  // Каргогийн өөрийн тохируулсан нэр (arrivedLabel/ereemLabel) бүх хэлэнд хэвээр.
  const { map: STATUS_LABEL, all: allLabel } = statusLabels(lang, { arrivedLabel, ereemLabel, batchMode })
  const TABS = BASE_TABS
    .filter(tab => !(batchMode && tab.key === 'EREEN_ARRIVED'))
    .map(tab => tab.key === 'ALL' ? { ...tab, label: allLabel } : { ...tab, label: STATUS_LABEL[tab.key] ?? tab.label })
  const [shipments, setShipments] = useState(initialShipments)
  const [activeTab, setActiveTab] = useState('ALL')
  const [viewMode, setViewMode] = useState<'list' | 'byDate'>('list')
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const confirmStatus = confirmDelete !== null ? shipments.find((x: { id: number; status: string }) => x.id === confirmDelete)?.status : undefined
  const [deleteAllModal, setDeleteAllModal] = useState(false)
  const [deleteAllInput, setDeleteAllInput] = useState('')
  const [deleteAllLoading, setDeleteAllLoading] = useState(false)
  const [deleteRegistered, setDeleteRegistered] = useState(false)
  const [deletePickedUp, setDeletePickedUp] = useState(true)
  const [deleteEreen, setDeleteEreen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [expandedBatch, setExpandedBatch] = useState<number | null>(null)
  const [navPopup, setNavPopup] = useState<'faq' | 'nameless' | 'profile' | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ trackCode: '', description: '' })
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [addedCodes, setAddedCodes] = useState<string[]>([])
  const addInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addOpen) setTimeout(() => addInputRef.current?.focus(), 100)
    else { setAddForm({ trackCode: '', description: '' }); setAddError(''); setAddedCodes([]) }
  }, [addOpen])


  async function submitAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.trackCode.trim()) return
    if (!/\d/.test(addForm.trackCode)) { setAddError('Трак код дор хаяж нэг тоо агуулсан байх ёстой'); return }
    setAddLoading(true)
    setAddError('')
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    const data = await res.json()
    setAddLoading(false)
    if (!res.ok) { setAddError(data.error); return }
    setShipments(prev => [data, ...prev])
    setAddedCodes(prev => [data.trackCode, ...prev])
    setAddForm({ trackCode: '', description: '' })
    addInputRef.current?.focus()
  }


  async function logout() {
    if (!await confirmAsync('Гарахдаа итгэлтэй байна уу?')) return
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  async function deleteAll() {
    const deletable = shipments.filter(s =>
      (deleteRegistered && s.status === 'REGISTERED') ||
      (deletePickedUp && s.status === 'PICKED_UP') ||
      (deleteEreen && s.status === 'EREEN_ARRIVED')
    )
    if (deletable.length === 0) return
    setDeleteAllLoading(true)
    await fetch('/api/orders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: deletable.map(s => s.id) }),
    })
    setShipments(prev => prev.filter(s =>
      !(deleteRegistered && s.status === 'REGISTERED') &&
      !(deletePickedUp && s.status === 'PICKED_UP') &&
      !(deleteEreen && s.status === 'EREEN_ARRIVED')
    ))
    setDeleteAllLoading(false)
    setDeleteAllModal(false)
    setDeleteAllInput('')
  }

  async function deleteShipment(id: number) {
    setDeleting(id)
    try {
      const res = await fetch('/api/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error()
      const wasEreen = shipments.find((x: { id: number; status: string }) => x.id === id)?.status === 'EREEN_ARRIVED'
      setShipments(prev => prev.filter(s => s.id !== id))
      toast.success(wasEreen ? 'Жагсаалтаас хасагдлаа' : 'Устгагдлаа')
    } catch {
      toast.error('Устгахад алдаа гарлаа. Дахин оролдоно уу.')
    } finally {
      setDeleting(null)
      setConfirmDelete(null)
    }
  }


  // Батч горимт карго бүхэлдээ юань тооцоотой
  const CUR = batchMode ? '¥' : '₮'

  // Багцад орсон ачаанууд энгийн жагсаалтад давхардахгүй — багц картаараа харагдана
  const soloShipments = shipments.filter(s => !s.batchId)

  const afterSearch = soloShipments
    .filter(s => !searchQ.trim() || s.trackCode.toLowerCase().includes(searchQ.trim().toLowerCase()) || (s.phone || '').includes(searchQ.trim()))

  const filtered = activeTab === 'ALL' ? afterSearch : afterSearch.filter(s => s.status === activeTab)

  // Өдрөөр бүлэглэсэн харагдац — сонгосон таб/хайлтад тааруулсан жагсаалтыг
  // огноогоор (сүүлийнхээс эхлээд) бүлэглэнэ, admin/report-той адил хэлбэр.
  const groupedByDate = useMemo(() => {
    const map = new Map<string, Shipment[]>()
    for (const s of filtered) {
      const d = new Date(s.updatedAt)
      const key = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({
        date,
        items,
        total: items.reduce((sum, s) => sum + (s.adminPrice ? Number(s.adminPrice) : 0), 0),
      }))
  }, [filtered])

  const totalPages = viewMode === 'byDate'
    ? Math.max(1, Math.ceil(groupedByDate.length / PAGE_SIZE))
    : Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const pagedDateGroups = groupedByDate.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const q = searchQ.trim().toUpperCase()
  const filteredBatches = batches.filter(b =>
    (activeTab === 'ALL' || b.status === activeTab) &&
    (!q || b.shipments.some(s => s.trackCode.toUpperCase().includes(q)) || b.phone.includes(q))
  )

  function switchTab(key: string) { setActiveTab(key); setPage(1); setExpandedDate(null); setNavPopup(null) }
  function switchView(mode: 'list' | 'byDate') { setViewMode(mode); setPage(1); setExpandedDate(null); setNavPopup(null) }

  function renderPagination() {
    if (totalPages <= 1) return null
    const pages: (number | '...')[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (page > 3) pages.push('...')
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
      if (page < totalPages - 2) pages.push('...')
      pages.push(totalPages)
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'center' }}>
        <button onClick={() => { setNavPopup(null); setPage(p => Math.max(1, p - 1)) }} disabled={page === 1} style={{
          width: 32, height: 32, borderRadius: '8px', border: '1px solid var(--border)',
          background: 'var(--surface)', cursor: page === 1 ? 'not-allowed' : 'pointer',
          opacity: page === 1 ? 0.4 : 1, fontSize: '0.9rem', color: 'var(--text)',
        }}>‹</button>
        {pages.map((p, i) => p === '...'
          ? <span key={`e${i}`} style={{ fontSize: '0.78rem', color: 'var(--muted)', padding: '0 0.1rem' }}>…</span>
          : <button key={p} onClick={() => { setNavPopup(null); setPage(p) }} style={{
            width: 32, height: 32, borderRadius: '8px', border: '1px solid',
            borderColor: p === page ? 'var(--accent)' : 'var(--border)',
            background: p === page ? 'var(--accent)' : 'var(--surface)',
            color: p === page ? 'var(--on-accent)' : 'var(--text)',
            cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
          }}>{p}</button>
        )}
        <button onClick={() => { setNavPopup(null); setPage(p => Math.min(totalPages, p + 1)) }} disabled={page === totalPages} style={{
          width: 32, height: 32, borderRadius: '8px', border: '1px solid var(--border)',
          background: 'var(--surface)', cursor: page === totalPages ? 'not-allowed' : 'pointer',
          opacity: page === totalPages ? 0.4 : 1, fontSize: '0.9rem', color: 'var(--text)',
        }}>›</button>
      </div>
    )
  }

  return (
    <>
      <AnnouncementModal />
      <SuperAnnouncementModal endpoint="user" />
      <nav className="nav">
        <Link href="/" style={{ minWidth: 0, overflow: 'hidden' }}><NavLogo name={cargoName || undefined} logoUrl={logoUrl || undefined} /></Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.1rem', flexShrink: 0 }}>
          <NavItem label={t.navFaq}>
            <button onClick={() => setNavPopup(navPopup === 'faq' ? null : 'faq')} title={t.faqTooltip} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 38, height: 38, borderRadius: '50%',
              background: 'none', border: 'none', cursor: 'pointer',
              color: navPopup === 'faq' ? 'var(--accent)' : 'var(--muted)',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor"/>
              </svg>
            </button>
          </NavItem>
          <NavItem label={t.navSearch}>
            <button onClick={() => setNavPopup(navPopup === 'nameless' ? null : 'nameless')} title={t.namelessTooltip} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 38, height: 38, borderRadius: '50%',
              background: 'none', border: 'none', cursor: 'pointer',
              color: navPopup === 'nameless' ? 'var(--accent)' : 'var(--muted)',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
          </NavItem>
          <NavItem label={t.navProfile}>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setNavPopup(navPopup === 'profile' ? null : 'profile')} title={userName} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 38, height: 38, borderRadius: '50%',
              background: 'none', border: 'none', cursor: 'pointer',
              color: navPopup === 'profile' ? 'var(--accent)' : 'var(--muted)',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            {navPopup === 'profile' && (
              <div style={{
                position: 'fixed', top: '3.5rem', right: '1rem',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                minWidth: 200, padding: '0.75rem 1rem', zIndex: 1000,
              }}>
                <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.myInfo}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{t.name}</span>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.1rem' }}>{userName}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{t.phone}</span>
                    <p style={{ fontSize: '0.85rem', fontFamily: 'monospace', marginTop: '0.1rem' }}>{userPhone}</p>
                  </div>
                  {userEmail && (
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{t.email}</span>
                      <p style={{ fontSize: '0.85rem', marginTop: '0.1rem' }}>{userEmail}</p>
                    </div>
                  )}
                  {cargoName && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.35rem', marginTop: '0.1rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{t.cargo}</span>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)', marginTop: '0.1rem' }}>{cargoName}</p>
                    </div>
                  )}
                  {/* Хэл солигч */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.45rem', marginTop: '0.1rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{t.language}</span>
                    <div style={{ display: 'flex', gap: 4, marginTop: '0.35rem' }}>
                      {(['mn', 'en', 'cn'] as UserLang[]).map(l => (
                        <button key={l} onClick={async () => { if (l !== lang && await confirmAsync(LANG_CONFIRM[l])) setLang(l) }} style={{
                          flex: 1, padding: '0.3rem 0.5rem', borderRadius: 8,
                          border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: '0.75rem', fontWeight: 700,
                          borderColor: lang === l ? 'var(--accent)' : 'var(--border)',
                          background: lang === l ? 'var(--accent)' : 'var(--surface)',
                          color: lang === l ? 'var(--on-accent)' : 'var(--muted)',
                        }}>
                          {l === 'mn' ? 'MN' : l === 'en' ? 'EN' : '中文'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Дэлгэцийн горим */}
                  <div style={{
                    borderTop: '1px solid var(--border)', paddingTop: '0.45rem', marginTop: '0.1rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{t.navTheme}</span>
                    <ThemeToggle />
                  </div>
                </div>

                <button onClick={logout} style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%',
                  marginTop: '0.6rem', padding: '0.5rem 0', border: 'none', borderTop: '1px solid var(--border)',
                  background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '0.82rem', color: 'var(--danger)',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  {t.navLogout}
                </button>
              </div>
            )}
          </div>
          </NavItem>
        </div>
      </nav>
      <ChatWidget open={navPopup === 'faq'} onClose={() => setNavPopup(null)} />
      <NamelessSearch open={navPopup === 'nameless'} onClose={() => setNavPopup(null)} t={t} />
      {aiEnabled && <UserAIWidget userName={userName} cargoName={cargoName} suggestions={aiSuggestions} />}
      {/* z-index 99: nav (z=100) доторх dropdown-ий товчнууд дарагдахуйц байхын тулд nav-аас доогуур */}
      {navPopup === 'profile' && <div onClick={() => setNavPopup(null)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />}

      {/* Delete all modal */}
      {deleteAllModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={() => setDeleteAllModal(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{
            position: 'relative', background: 'var(--surface)', borderRadius: '16px',
            padding: '1.5rem', width: 'calc(100% - 2rem)', maxWidth: 400,
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--danger)', marginBottom: '0.75rem' }}>{t.deleteAllTitle}</h2>

            {/* Checkboxes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {shipments.some(s => s.status === 'REGISTERED') && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.88rem' }}>
                  <input type="checkbox" checked={deleteRegistered} onChange={e => setDeleteRegistered(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--danger)' }} />
                  <span>{STATUS_LABEL.REGISTERED} <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>({shipments.filter(s => s.status === 'REGISTERED').length})</span></span>
                </label>
              )}
              {shipments.some(s => s.status === 'EREEN_ARRIVED') && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.88rem' }}>
                  <input type="checkbox" checked={deleteEreen} onChange={e => setDeleteEreen(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--danger)' }} />
                  <span>
                    {STATUS_LABEL.EREEN_ARRIVED} <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>({shipments.filter(s => s.status === 'EREEN_ARRIVED').length})</span>
                    <span style={{ display: 'block', color: 'var(--muted)', fontSize: '0.72rem' }}>Таны жагсаалтаас хасагдана, каргогийн бүртгэлд үлдэнэ</span>
                  </span>
                </label>
              )}
              {shipments.some(s => s.status === 'PICKED_UP') && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.88rem' }}>
                  <input type="checkbox" checked={deletePickedUp} onChange={e => setDeletePickedUp(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--danger)' }} />
                  <span>{STATUS_LABEL.PICKED_UP} <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>({shipments.filter(s => s.status === 'PICKED_UP').length})</span></span>
                </label>
              )}
            </div>

            <p style={{ fontSize: '0.82rem', marginBottom: '0.5rem', color: 'var(--muted)', lineHeight: 1.5 }}>
              {t.deleteIrreversible}
            </p>
            <input
              className="input"
              placeholder="УСТГАХ"
              value={deleteAllInput}
              onChange={e => setDeleteAllInput(e.target.value)}
              style={{ marginBottom: '1rem', borderColor: deleteAllInput === 'УСТГАХ' ? 'var(--danger)' : undefined }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button
                className="btn"
                onClick={deleteAll}
                disabled={deleteAllInput !== 'УСТГАХ' || deleteAllLoading || (!deleteRegistered && !deletePickedUp && !deleteEreen)}
                style={{ flex: 1, background: 'var(--danger)', borderColor: 'var(--danger)', opacity: deleteAllInput === 'УСТГАХ' ? 1 : 0.4 }}
              >
                {deleteAllLoading ? t.deleting : t.deleteBtn}
              </button>
              <button onClick={() => setDeleteAllModal(false)} style={{
                flex: 1, padding: '0.6rem', borderRadius: 'var(--radius)',
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem',
              }}>{t.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add shipment drawer */}
      {addOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setAddOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
          <div style={{
            position: 'absolute', top: '6%', left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--surface)', borderRadius: '16px',
            padding: '1.5rem',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            width: 'calc(100% - 2rem)', maxWidth: 480,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{t.addTitle}</h2>
              <button onClick={() => setAddOpen(false)} style={{
                background: 'var(--surface2)', border: 'none', cursor: 'pointer',
                width: 32, height: 32, borderRadius: '50%', fontSize: '1rem',
                color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
            </div>
            <form onSubmit={submitAdd}>
              <div className="form-group">
                <label>{t.trackCode}</label>
                <input ref={addInputRef} className="input" placeholder={t.trackCodePh} required
                  value={addForm.trackCode}
                  onChange={e => setAddForm({ ...addForm, trackCode: e.target.value })} />
              </div>
              <div className="form-group">
                <label>{t.description}</label>
                <textarea className="input" placeholder={t.descriptionPh} rows={2} required
                  value={addForm.description}
                  onChange={e => setAddForm({ ...addForm, description: e.target.value })} />
              </div>
              {addError && <p className="msg-error">{addError}</p>}
              <button className="btn" type="submit" disabled={addLoading || !addForm.trackCode.trim() || !addForm.description.trim()}
                style={{ width: '100%', marginTop: '0.25rem' }}>
                {addLoading ? t.saving : t.registerBtn}
              </button>
            </form>
            {addedCodes.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '0.4rem' }}>
                  {t.registeredList} ({addedCodes.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {addedCodes.map((code, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.45rem 0.75rem', background: 'var(--bg)',
                      border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.85rem',
                    }}>
                      <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{code}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="page orders-page">
        <div className="orders-head">
          <div className="orders-head-title">
            <h1 className="section-title" style={{ marginBottom: 0 }}>{t.myOrders}</h1>
            {filtered.length > 0 && (
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                {fmt(t.totalItems, { n: filtered.length })}
              </span>
            )}
          </div>
          <div className="orders-head-actions">
            {shipments.some(s => s.status === 'REGISTERED' || s.status === 'PICKED_UP' || s.status === 'EREEN_ARRIVED') && (
              <button className="orders-del" title={t.deleteAll} aria-label={t.deleteAll} onClick={() => { setNavPopup(null); setDeleteAllModal(true); setDeleteAllInput(''); setDeleteRegistered(false); setDeletePickedUp(true); setDeleteEreen(false) }}>
                <Trash2 size={16} strokeWidth={2} />
              </button>
            )}
            <button className="btn" onClick={() => { setNavPopup(null); setAddOpen(true) }} style={{ fontSize: '0.85rem', padding: '0.55rem 1rem' }}>
              {t.addBtn}
            </button>
          </div>
        </div>
        {(() => {
          const arrived = shipments.filter(s => s.status === 'ARRIVED')
          const total = arrived.reduce((sum, s) => sum + (s.adminPrice ? Number(s.adminPrice) : 0), 0)
          if (arrived.length === 0) return null
          // Ирсэн ачааны товч мөр — дарахад "Ирсэн" таб руу шилжинэ
          return (
            <button className="oh-sum" onClick={() => switchTab('ARRIVED')}>
              <PackageCheck size={18} strokeWidth={2.2} />
              <span className="oh-sum-txt">{STATUS_LABEL.ARRIVED} · <b>{arrived.length} {t.items}</b></span>
              {total > 0 && <b className="oh-sum-price">{CUR}{total.toLocaleString()}</b>}
              <ChevronRight size={16} />
            </button>
          )
        })()}

        {/* Search */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
          <input
            className="input"
            placeholder={t.searchPh}
            value={searchQ}
            onChange={e => { setSearchQ(e.target.value); setPage(1); setNavPopup(null) }}
            style={{ flex: 1, minWidth: 0 }}
          />
          <div style={{ display: 'flex', gap: '0.2rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: 3, flexShrink: 0 }}>
            {([['list', t.viewList], ['byDate', t.viewByDate]] as const).map(([mode, label]) => (
              <button key={mode} onClick={() => switchView(mode)} style={{
                padding: '0.4rem 0.8rem', borderRadius: 100, border: 'none',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600,
                background: viewMode === mode ? 'var(--accent)' : 'transparent',
                color: viewMode === mode ? 'var(--on-accent)' : 'var(--muted)',
                transition: 'background 0.15s, color 0.15s',
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        {/* Нэг мөр pill таб — тоо нь дотроо; багтахгүй бол хажуу тийш гүйлгэнэ */}
        <div className="otabs" role="tablist">
          {TABS.map(tab => {
            const count = tab.key === 'ALL' ? afterSearch.length : afterSearch.filter(s => s.status === tab.key).length
            const active = activeTab === tab.key
            return (
              <button key={tab.key} role="tab" aria-selected={active} className={active ? 'on' : ''} onClick={() => switchTab(tab.key)}>
                {tab.label}
                {count > 0 && <span>{count}</span>}
              </button>
            )
          })}
        </div>

        {shipments.length === 0 && batches.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Package size={26} strokeWidth={2} /></div>
            <h3>{t.emptyNone}</h3>
            <p>{t.emptyGuide}</p>
            <Link href="/orders/new" className="btn" style={{ textDecoration: 'none' }}>
              {t.emptyCta}
            </Link>
          </div>
        ) : (filtered.length === 0 && filteredBatches.length === 0) ? (
          <div className="empty">
            <p>{searchQ ? fmt(t.emptyNoMatch, { q: searchQ }) : t.emptyStatus}</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
              {/* Багц ачаанууд — нэг карт, дарахад track кодууд дэлгэгдэнэ */}
              {filteredBatches.map((b, bi) => (
                <motion.div
                  key={`batch-${b.id}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(bi * 0.05, 0.4), ease: [0.22, 1, 0.36, 1] }}
                >
                <div className={`order-card order-card-${b.status}`}>
                  <div
                    className="order-card-head"
                    onClick={() => { setNavPopup(null); setExpandedBatch(expandedBatch === b.id ? null : b.id) }}
                    style={{ cursor: 'pointer' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700 }}><Boxes size={14} strokeWidth={2.2} style={{ verticalAlign: '-2px', marginRight: 5, flexShrink: 0 }} />{t.batch} B-{b.id}</span>
                      <span style={{
                        fontSize: '0.7rem', color: 'var(--muted)',
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        borderRadius: 100, padding: '0.05rem 0.5rem', whiteSpace: 'nowrap',
                      }}>
                        {b.shipments.length} {t.batchItems}
                      </span>
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={`badge badge-${b.status}`}>{STATUS_LABEL[b.status] ?? b.status}</span>
                      <span style={{
                        fontSize: '0.7rem', color: 'var(--muted)',
                        transform: expandedBatch === b.id ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.15s', display: 'inline-block',
                      }}>▶</span>
                    </div>
                  </div>
                  <ShipSteps status={b.status} labels={STATUS_LABEL} />
                  <div className="order-card-meta">
                    <div className="order-card-row">
                      <span>{t.totalPayment}</span>
                      <strong style={{ color: 'var(--accent)' }}>
                        {b.currency === 'CNY' ? `¥${Number(b.price).toLocaleString()}` : `₮${Number(b.price).toLocaleString()}`}
                      </strong>
                    </div>
                    <div className="order-card-row">
                      <span>{t.date}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{fmtDT(b.createdAt)}</span>
                    </div>
                    {b.note && (
                      <div className="order-card-row">
                        <span>{t.description}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{b.note}</span>
                      </div>
                    )}
                    {expandedBatch === b.id && (
                      <div style={{ paddingTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '0.35rem', fontWeight: 600 }}>
                          {t.batchInside}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {b.shipments.map(s => (
                            <div key={s.id} style={{
                              fontSize: '0.78rem', fontFamily: 'monospace',
                              padding: '0.3rem 0.5rem', background: 'var(--surface2)',
                              border: '1px solid var(--border)', borderRadius: 6,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {s.trackCode}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                </motion.div>
              ))}

              {viewMode === 'list' ? paged.map((s, si) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(si * 0.05, 0.4), ease: [0.22, 1, 0.36, 1] }}
                >
                <ShipmentCard
                  s={s}
                  t={t}
                  labels={STATUS_LABEL}
                  cur={CUR}
                  userPhone={userPhone}
                  deleting={deleting === s.id}
                  onDelete={() => { setNavPopup(null); setConfirmDelete(s.id) }}
                />
                </motion.div>
              )) : pagedDateGroups.map(g => (
                <div key={g.date} className="card" style={{ overflow: 'hidden' }}>
                  <div
                    onClick={() => setExpandedDate(expandedDate === g.date ? null : g.date)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.75rem 1.1rem', cursor: 'pointer', gap: '0.5rem',
                      borderBottom: expandedDate === g.date ? '1px solid var(--border)' : 'none',
                      background: expandedDate === g.date ? 'var(--surface2)' : 'var(--surface)',
                      transition: 'background 0.12s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--muted)', transform: expandedDate === g.date ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                      <strong style={{ fontSize: '0.9rem' }}>{g.date}</strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '0.1rem 0.55rem', flexShrink: 0 }}>
                        {g.items.length} {t.items}
                      </span>
                    </div>
                    {g.total > 0 && (
                      <strong style={{ color: 'var(--accent)', fontSize: '0.88rem', flexShrink: 0 }}>{CUR}{g.total.toLocaleString()}</strong>
                    )}
                  </div>
                  {expandedDate === g.date && (
                    <div>
                      {g.items.length === 0 ? (
                        <p style={{ padding: '0.75rem 1.1rem', fontSize: '0.8rem', color: 'var(--muted)' }}>{t.groupNoItems}</p>
                      ) : g.items.map((s, si) => (
                        <div key={s.id} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '0.55rem 1.1rem', gap: '0.5rem', fontSize: '0.82rem', background: 'var(--bg)',
                          borderBottom: si < g.items.length - 1 ? '1px solid var(--border)' : 'none',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, overflow: 'hidden' }}>
                            <CopyText text={s.trackCode} style={{ fontFamily: 'monospace', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.trackCode}
                            </CopyText>
                            <span className={`badge badge-${s.status}`} style={{ fontSize: '0.62rem', padding: '0.15rem 0.5rem', flexShrink: 0 }}>{STATUS_LABEL[s.status] ?? s.status}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                            <span style={{ color: s.adminPrice ? 'var(--accent)' : 'var(--muted)', fontWeight: 600 }}>
                              {s.adminPrice ? `${CUR}${Number(s.adminPrice).toLocaleString()}` : '—'}
                            </span>
                            {(s.status === 'REGISTERED' || s.status === 'PICKED_UP' || s.status === 'EREEN_ARRIVED') && (
                              <button onClick={() => setConfirmDelete(s.id)} disabled={deleting === s.id}
                                title={s.status === 'PICKED_UP' ? t.archiveTooltip : t.deleteTooltip}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.8rem', padding: '0.1rem 0.2rem', lineHeight: 1, opacity: deleting === s.id ? 0.4 : 1 }}>
                                <Trash2 size={14} strokeWidth={2} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {renderPagination()}
            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
              {fmt(t.totalItems, { n: filtered.length })}
            </p>
          </>
        )}

        <PriceCalculator priceCubic={priceCubic} priceWeight={priceWeight} priceWeightUnit={priceWeightUnit} priceWeightTiers={priceWeightTiers} t={t} />
      </div>
      <ConfirmDialog
        open={confirmDelete !== null}
        title={confirmStatus === 'EREEN_ARRIVED' ? 'Жагсаалтаас хасах уу?' : 'Бараа устгах уу?'}
        message={confirmStatus === 'EREEN_ARRIVED'
          ? 'Энэ бараа таны жагсаалтаас хасагдана. Каргогийн бүртгэлд үлдэх бөгөөд карго тань хассаныг харна. Андуурсан бол карготойгоо холбогдоно уу.'
          : 'Энэ бараа жагсаалтаас бүрмөсөн устна. Буцаах боломжгүй.'}
        confirmLabel={confirmStatus === 'EREEN_ARRIVED' ? 'Хасах' : 'Устгах'}
        cancelLabel="Болих"
        danger
        loading={deleting !== null}
        onConfirm={() => confirmDelete !== null && deleteShipment(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
      <SiteFooter cargoName={cargoName} ereemReceiver={ereemReceiver} ereemPhone={ereemPhone} ereemRegion={ereemRegion} ereemAddress={ereemAddress} tariff={tariff} announcement={announcement} contactInfo={contactInfo} bankName={bankName} bankAccountHolder={bankAccountHolder} bankAccountNumber={bankAccountNumber} bankTransferNote={bankTransferNote} />
    </>
  )
}

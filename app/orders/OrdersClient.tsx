'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SiteFooter from '../components/SiteFooter'
import ChatWidget from '../components/ChatWidget'
import NavLogo from '../components/NavLogo'
import AnnouncementModal from '../components/AnnouncementModal'
import UserAIWidget from '../components/UserAIWidget'
import ThemeToggle from '../components/ThemeToggle'


function getStatusLabel(arrivedLabel?: string | null, ereemLabel?: string | null): Record<string, string> {
  return {
    REGISTERED: 'Бүртгүүлсэн',
    EREEN_ARRIVED: ereemLabel || 'Эрээнд ирсэн',
    ARRIVED: arrivedLabel || 'Ирсэн',
    PICKED_UP: 'Авсан',
  }
}

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
  batchId?: number | null
}

interface UserBatch {
  id: number
  phone: string
  price: string
  currency: 'MNT' | 'CNY'
  status: string
  createdAt: string
  shipments: { id: number; trackCode: string }[]
}

function fmtDT(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear().toString().slice(2)}.${d.getMonth()+1}.${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`
}

function CopyText({ text, children, style }: { text: string; children: React.ReactNode; style?: React.CSSProperties }) {
  const [copied, setCopied] = useState(false)
  function copy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <span onClick={copy} title="Хуулах" style={{ cursor: 'pointer', ...style }}>
      {copied ? <span style={{ color: 'var(--green)' }}>✓ Хуулагдлаа</span> : children}
    </span>
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
  announcement,
  contactInfo,
  bankName,
  bankAccountHolder,
  bankAccountNumber,
  bankTransferNote,
  arrivedLabel,
  ereemLabel,
  aiEnabled,
  yuanMode = false,
  batches = [],
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
  announcement?: string | null
  contactInfo?: string | null
  bankName?: string | null
  bankAccountHolder?: string | null
  bankAccountNumber?: string | null
  bankTransferNote?: string | null
  arrivedLabel?: string | null
  ereemLabel?: string | null
  aiEnabled?: boolean
  yuanMode?: boolean
  batches?: UserBatch[]
}) {
  const router = useRouter()
  const STATUS_LABEL = getStatusLabel(arrivedLabel, ereemLabel)
  const TABS = BASE_TABS.map(t => {
    if (t.key === 'ARRIVED') return { ...t, label: arrivedLabel || 'Ирсэн' }
    if (t.key === 'EREEN_ARRIVED') return { ...t, label: ereemLabel || 'Эрээнд' }
    return t
  })
  const [shipments, setShipments] = useState(initialShipments)
  const [activeTab, setActiveTab] = useState('ALL')
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deleteAllModal, setDeleteAllModal] = useState(false)
  const [deleteAllInput, setDeleteAllInput] = useState('')
  const [deleteAllLoading, setDeleteAllLoading] = useState(false)
  const [deleteRegistered, setDeleteRegistered] = useState(false)
  const [deletePickedUp, setDeletePickedUp] = useState(true)
  const [searchQ, setSearchQ] = useState('')
  const [expandedBatch, setExpandedBatch] = useState<number | null>(null)
  const [faqOpen, setFaqOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
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
    if (!confirm('Гарахдаа итгэлтэй байна уу?')) return
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  async function deleteAll() {
    const deletable = shipments.filter(s =>
      (deleteRegistered && s.status === 'REGISTERED') ||
      (deletePickedUp && s.status === 'PICKED_UP')
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
      !(deletePickedUp && s.status === 'PICKED_UP')
    ))
    setDeleteAllLoading(false)
    setDeleteAllModal(false)
    setDeleteAllInput('')
  }

  async function deleteShipment(id: number) {
    if (!confirm('Энэ барааг жагсаалтаас устгах уу?')) return
    setDeleting(id)
    await fetch('/api/orders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setShipments(prev => prev.filter(s => s.id !== id))
    setDeleting(null)
  }


  // Багц feature астай карго бүхэлдээ юань тооцоотой
  const CUR = yuanMode ? '¥' : '₮'

  // Багцад орсон ачаанууд энгийн жагсаалтад давхардахгүй — багц картаараа харагдана
  const soloShipments = shipments.filter(s => !s.batchId)

  const afterSearch = soloShipments
    .filter(s => !searchQ.trim() || s.trackCode.toLowerCase().includes(searchQ.trim().toLowerCase()) || (s.phone || '').includes(searchQ.trim()))

  const filtered = activeTab === 'ALL' ? afterSearch : afterSearch.filter(s => s.status === activeTab)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const q = searchQ.trim().toUpperCase()
  const filteredBatches = batches.filter(b =>
    (activeTab === 'ALL' || b.status === activeTab) &&
    (!q || b.shipments.some(s => s.trackCode.toUpperCase().includes(q)) || b.phone.includes(q))
  )

  function switchTab(key: string) { setActiveTab(key); setPage(1) }

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
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{
          width: 32, height: 32, borderRadius: '8px', border: '1px solid var(--border)',
          background: 'var(--surface)', cursor: page === 1 ? 'not-allowed' : 'pointer',
          opacity: page === 1 ? 0.4 : 1, fontSize: '0.9rem', color: 'var(--text)',
        }}>‹</button>
        {pages.map((p, i) => p === '...'
          ? <span key={`e${i}`} style={{ fontSize: '0.78rem', color: 'var(--muted)', padding: '0 0.1rem' }}>…</span>
          : <button key={p} onClick={() => setPage(p)} style={{
            width: 32, height: 32, borderRadius: '8px', border: '1px solid',
            borderColor: p === page ? 'var(--accent)' : 'var(--border)',
            background: p === page ? 'var(--accent)' : 'var(--surface)',
            color: p === page ? '#fff' : 'var(--text)',
            cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
          }}>{p}</button>
        )}
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{
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
      <nav className="nav">
        <Link href="/"><NavLogo name={cargoName || undefined} logoUrl={logoUrl || undefined} /></Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.1rem' }}>
          <ThemeToggle />
          <button onClick={() => setFaqOpen(o => !o)} title="Асуулт хариулт" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 38, height: 38, borderRadius: '50%',
            background: 'none', border: 'none', cursor: 'pointer',
            color: faqOpen ? 'var(--accent)' : 'var(--muted)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor"/>
            </svg>
          </button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setProfileOpen(o => !o)} title={userName} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 38, height: 38, borderRadius: '50%',
              background: 'none', border: 'none', cursor: 'pointer',
              color: profileOpen ? 'var(--accent)' : 'var(--muted)',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            </button>
            {profileOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                minWidth: 200, padding: '0.75rem 1rem', zIndex: 999,
              }}>
                <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Миний мэдээлэл</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Нэр</span>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.1rem' }}>{userName}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Утас</span>
                    <p style={{ fontSize: '0.85rem', fontFamily: 'monospace', marginTop: '0.1rem' }}>{userPhone}</p>
                  </div>
                  {userEmail && (
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>И-мэйл</span>
                      <p style={{ fontSize: '0.85rem', marginTop: '0.1rem' }}>{userEmail}</p>
                    </div>
                  )}
                  {cargoName && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.35rem', marginTop: '0.1rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Карго</span>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)', marginTop: '0.1rem' }}>{cargoName}</p>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
          <button onClick={logout} title="Гарах" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 38, height: 38, borderRadius: '50%',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </nav>
      <ChatWidget open={faqOpen} onClose={() => setFaqOpen(false)} />
      {aiEnabled && <UserAIWidget userName={userName} cargoName={cargoName} />}
      {profileOpen && <div onClick={() => setProfileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />}

      {/* Delete all modal */}
      {deleteAllModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={() => setDeleteAllModal(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{
            position: 'relative', background: 'var(--surface)', borderRadius: '16px',
            padding: '1.5rem', width: 'calc(100% - 2rem)', maxWidth: 400,
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--danger)', marginBottom: '0.75rem' }}>⚠ Бүгдийг устгах</h2>

            {/* Checkboxes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {shipments.some(s => s.status === 'REGISTERED') && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.88rem' }}>
                  <input type="checkbox" checked={deleteRegistered} onChange={e => setDeleteRegistered(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--danger)' }} />
                  <span>Бүртгүүлсэн <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>({shipments.filter(s => s.status === 'REGISTERED').length})</span></span>
                </label>
              )}
              {shipments.some(s => s.status === 'PICKED_UP') && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.88rem' }}>
                  <input type="checkbox" checked={deletePickedUp} onChange={e => setDeletePickedUp(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--danger)' }} />
                  <span>Авсан <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>({shipments.filter(s => s.status === 'PICKED_UP').length})</span></span>
                </label>
              )}
            </div>

            <p style={{ fontSize: '0.82rem', marginBottom: '0.5rem', color: 'var(--muted)', lineHeight: 1.5 }}>
              Энэ үйлдлийг буцааж болохгүй. Үргэлжлүүлэхийн тулд <strong style={{ color: 'var(--text)' }}>УСТГАХ</strong> гэж бичнэ үү:
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
                disabled={deleteAllInput !== 'УСТГАХ' || deleteAllLoading || (!deleteRegistered && !deletePickedUp)}
                style={{ flex: 1, background: 'var(--danger)', borderColor: 'var(--danger)', opacity: deleteAllInput === 'УСТГАХ' ? 1 : 0.4 }}
              >
                {deleteAllLoading ? 'Устгаж байна...' : 'Устгах'}
              </button>
              <button onClick={() => setDeleteAllModal(false)} style={{
                flex: 1, padding: '0.6rem', borderRadius: 'var(--radius)',
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem',
              }}>Болих</button>
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
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Бараа бүртгэх</h2>
              <button onClick={() => setAddOpen(false)} style={{
                background: 'var(--surface2)', border: 'none', cursor: 'pointer',
                width: 32, height: 32, borderRadius: '50%', fontSize: '1rem',
                color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
            </div>
            <form onSubmit={submitAdd}>
              <div className="form-group">
                <label>Трак код</label>
                <input ref={addInputRef} className="input" placeholder="жш: YT2580126073683" required
                  value={addForm.trackCode}
                  onChange={e => setAddForm({ ...addForm, trackCode: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Тайлбар</label>
                <textarea className="input" placeholder="Барааны тайлбар..." rows={2} required
                  value={addForm.description}
                  onChange={e => setAddForm({ ...addForm, description: e.target.value })} />
              </div>
              {addError && <p className="msg-error">{addError}</p>}
              <button className="btn" type="submit" disabled={addLoading || !addForm.trackCode.trim() || !addForm.description.trim()}
                style={{ width: '100%', marginTop: '0.25rem' }}>
                {addLoading ? 'Хадгалж байна...' : 'Бүртгэх'}
              </button>
            </form>
            {addedCodes.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '0.4rem' }}>
                  Бүртгэгдсэн ({addedCodes.length})
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

      <div className="page">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <h1 className="section-title" style={{ marginBottom: 0 }}>Миний захиалгууд</h1>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {shipments.some(s => s.status === 'REGISTERED' || s.status === 'PICKED_UP') && (
              <button onClick={() => { setDeleteAllModal(true); setDeleteAllInput(''); setDeleteRegistered(false); setDeletePickedUp(true) }} style={{
                fontSize: '0.8rem', padding: '0.5rem 0.85rem',
                background: 'none', border: '1px solid var(--danger)',
                borderRadius: 'var(--radius)', color: 'var(--danger)',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                Бүгдийг устгах
              </button>
            )}
            <button className="btn" onClick={() => setAddOpen(true)} style={{ fontSize: '0.85rem', padding: '0.55rem 1rem' }}>
              + Бүртгэх
            </button>
          </div>
        </div>
        {(() => {
          const arrived = shipments.filter(s => s.status === 'ARRIVED')
          const total = arrived.reduce((sum, s) => sum + (s.adminPrice ? Number(s.adminPrice) : 0), 0)
          if (arrived.length === 0) return null
          return (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
              <span style={{ fontSize: '0.78rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.2rem 0.75rem', color: 'var(--muted)' }}>
                Ирсэн <strong style={{ color: 'var(--text)' }}>{arrived.length} бараа</strong>
              </span>
              {total > 0 && (
                <span style={{ fontSize: '0.78rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.2rem 0.75rem', color: 'var(--muted)' }}>
                  Нийт <strong style={{ color: 'var(--accent)' }}>{CUR}{total.toLocaleString()}</strong>
                </span>
              )}
            </div>
          )
        })()}

        {/* Search */}
        <input
          className="input"
          placeholder="Трак кодоор хайх..."
          value={searchQ}
          onChange={e => { setSearchQ(e.target.value); setPage(1) }}
          style={{ marginBottom: '0.9rem', maxWidth: 320 }}
        />

        {/* Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.3rem', marginBottom: '1rem' }}>
          {TABS.map(tab => {
            const count = tab.key === 'ALL' ? afterSearch.length : afterSearch.filter(s => s.status === tab.key).length
            const active = activeTab === tab.key
            return (
              <button key={tab.key} onClick={() => switchTab(tab.key)} style={{
                position: 'relative',
                padding: '0.5rem 0.25rem', borderRadius: '8px', border: '1px solid',
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                background: active ? 'var(--accent)' : 'var(--surface)',
                color: active ? '#fff' : 'var(--muted)',
                fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                textAlign: 'center', lineHeight: 1.3,
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
              }}>
                {tab.label}
                {count > 0 && (
                  <span style={{
                    position: 'absolute', top: '-6px', right: '-4px',
                    background: active ? '#fff' : 'var(--accent)',
                    color: active ? 'var(--accent)' : '#fff',
                    fontSize: '0.6rem', fontWeight: 700,
                    minWidth: 16, height: 16, borderRadius: '100px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 3px', lineHeight: 1,
                  }}>{count}</span>
                )}
              </button>
            )
          })}
        </div>

        {shipments.length === 0 && batches.length === 0 ? (
          <div className="empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.9rem' }}>
            <div style={{ fontSize: '2rem' }}>📦</div>
            <p style={{ margin: 0 }}>Бүртгэлтэй бараа байхгүй байна.</p>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
              Захиалсан барааныхаа трак кодыг бүртгүүлбэл ирэх явцыг нь эндээс хянах боломжтой.
            </p>
            <Link href="/orders/new" className="btn" style={{ textDecoration: 'none' }}>
              + Эхний барааг бүртгэх
            </Link>
          </div>
        ) : (filtered.length === 0 && filteredBatches.length === 0) ? (
          <div className="empty">
            <p>{searchQ ? `"${searchQ}" хайлтад тохирох бараа байхгүй.` : 'Энэ статуст бараа байхгүй байна.'}</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
              {/* Багц ачаанууд — нэг карт, дарахад track кодууд дэлгэгдэнэ */}
              {filteredBatches.map(b => (
                <div key={`batch-${b.id}`} className={`order-card order-card-${b.status}`}>
                  <div
                    className="order-card-head"
                    onClick={() => setExpandedBatch(expandedBatch === b.id ? null : b.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>📦 Багц B-{b.id}</span>
                      <span style={{
                        fontSize: '0.7rem', color: 'var(--muted)',
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        borderRadius: 100, padding: '0.05rem 0.5rem', whiteSpace: 'nowrap',
                      }}>
                        {b.shipments.length} ачаа
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
                  <div className="order-card-meta">
                    <div className="order-card-row">
                      <span>Нийт төлбөр</span>
                      <strong style={{ color: 'var(--accent)' }}>
                        {b.currency === 'CNY' ? `¥${Number(b.price).toLocaleString()}` : `₮${Number(b.price).toLocaleString()}`}
                      </strong>
                    </div>
                    <div className="order-card-row">
                      <span>Огноо</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{fmtDT(b.createdAt)}</span>
                    </div>
                    {expandedBatch === b.id && (
                      <div style={{ paddingTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '0.35rem', fontWeight: 600 }}>
                          Багц доторх ачаанууд:
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
              ))}

              {paged.map(s => (
                <div key={s.id} className={`order-card order-card-${s.status}`}>
                  <div className="order-card-head">
                    <CopyText text={s.phone || userPhone} style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>
                      {s.phone || userPhone}
                    </CopyText>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{fmtDT(s.updatedAt)}</span>
                      <span className={`badge badge-${s.status}`}>{STATUS_LABEL[s.status] ?? s.status}</span>
                      {(s.status === 'REGISTERED' || s.status === 'PICKED_UP') && (
                        <button onClick={() => deleteShipment(s.id)} disabled={deleting === s.id} title={s.status === 'PICKED_UP' ? 'Архивлах' : 'Устгах'} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--muted)', fontSize: '0.85rem', padding: '0.1rem 0.25rem',
                          borderRadius: '4px', lineHeight: 1, opacity: deleting === s.id ? 0.4 : 1,
                        }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
                        >🗑</button>
                      )}
                    </div>
                  </div>
                  <div className="order-card-meta">
                    <div className="order-card-row">
                      <span>Трак код</span>
                      <CopyText text={s.trackCode} style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                        {s.trackCode}
                      </CopyText>
                    </div>
                    <div className="order-card-row">
                      <span>Карго төлбөр</span>
                      <span>{s.adminPrice
                        ? <strong style={{ color: 'var(--accent)' }}>{CUR}{Number(s.adminPrice).toLocaleString()}</strong>
                        : '—'}
                      </span>
                    </div>
                    {s.description && (
                      <div className="order-card-row">
                        <span>Тайлбар</span>
                        <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{s.description}</span>
                      </div>
                    )}
                    {s.adminNote && (
                      <div className="order-card-row">
                        <span>Тэмдэглэл</span>
                        <CopyText text={s.adminNote}>{s.adminNote}</CopyText>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {renderPagination()}
            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
              Нийт {filtered.length} бараа
            </p>
          </>
        )}

      </div>
      <SiteFooter cargoName={cargoName} ereemReceiver={ereemReceiver} ereemPhone={ereemPhone} ereemRegion={ereemRegion} ereemAddress={ereemAddress} tariff={tariff} announcement={announcement} contactInfo={contactInfo} bankName={bankName} bankAccountHolder={bankAccountHolder} bankAccountNumber={bankAccountNumber} bankTransferNote={bankTransferNote} />
    </>
  )
}

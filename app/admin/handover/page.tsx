'use client'
import { Pencil, ScanLine } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useHandoverQuote, HandoverLoyaltyPanel } from './HandoverLoyalty'
import HandoverDone, { type HandoverDoneInfo } from './HandoverDone'
import { confirmAsync } from '@/app/components/ConfirmDialog'
import Combobox from '@/app/components/Combobox'
import { suggestCustomers } from '@/app/components/customer-suggest'
import { closeHandoverEdit, handoverPhoneGroupLabel, initialHandoverEdit, isRowEditing, openHandoverEdit } from '@/lib/handover-edit-state'

interface Shipment {
  id: number
  trackCode: string
  description: string | null
  adminPrice: number | null
  adminNote: string | null
  phone: string | null
  updatedAt?: string
  arrivedAt?: string | null
  createdAt?: string
  status?: string
}

const STATUS_LABEL: Record<string, string> = {
  REGISTERED: 'Бүртгүүлсэн',
  EREEN_ARRIVED: 'Эрээнд ирсэн',
  ARRIVED: 'Ирсэн',
  PICKED_UP: 'Олгосон',
}

function whenOf(s: Shipment) {
  return s.arrivedAt || s.updatedAt || s.createdAt || ''
}

function dateKey(s: Shipment) {
  const raw = whenOf(s)
  if (!raw) return ''
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA')
}

function RowContext({ s }: { s: Shipment }) {
  const when = whenOf(s)
  return (
    <div className="ho-meta">
      {when && <time dateTime={when}>{fmtDT(when)}</time>}
      {s.status && <span className={`badge badge-${s.status}`}>{STATUS_LABEL[s.status] ?? s.status}</span>}
      {s.adminNote && <span className="ho-note">Тайлбар: {s.adminNote}</span>}
    </div>
  )
}

function fmtDT(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear().toString().slice(2)}.${d.getMonth() + 1}.${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Group { phone: string; count: number; total: number; shipments: Shipment[] }
interface Summary { groups: Group[]; totalGroups: number; totalShipments: number; totalCustomers: number; totalValue: number; page: number; pageSize: number }
interface TodayStats { shipments: number; customers: number; value: number }

export default function HandoverPage() {
  const [mode, setMode] = useState<'search' | 'scanner'>('search')

  // ── Search mode ──
  const [q, setQ] = useState('')
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [searched, setSearched] = useState(false)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<HandoverDoneInfo | null>(null)

  // ── Scanner mode ──
  const scanRef = useRef<HTMLInputElement>(null)
  const [scanInput, setScanInput] = useState('')
  const [scanned, setScanned] = useState<Shipment[]>([])
  const [scanMsg, setScanMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [scanDone, setScanDone] = useState<HandoverDoneInfo | null>(null)
  const [scanLoading, setScanLoading] = useState(false)

  // ── Summary ──
  const [summary, setSummary] = useState<Summary | null>(null)
  const [summaryPage, setSummaryPage] = useState(1)
  const [expandedPhone, setExpandedPhone] = useState<string | null>(null)
  const [today, setToday] = useState<TodayStats | null>(null)
  const [rowEdit, setRowEdit] = useState(initialHandoverEdit)
  const [rowError, setRowError] = useState('')
  const [rowBusy, setRowBusy] = useState(false)

  function patchRow(id: number, trackCode: string, adminPrice: number | null) {
    const apply = (s: Shipment) => s.id === id ? { ...s, trackCode, adminPrice } : s
    setShipments(prev => prev.map(apply))
    setScanned(prev => prev.map(apply))
    setSummary(prev => {
      if (!prev) return prev
      let valueDelta = 0
      const groups = prev.groups.map(g => {
        const old = g.shipments.find(s => s.id === id)
        const shipments = g.shipments.map(apply)
        if (!old) return { ...g, shipments }
        const delta = (Number(adminPrice) || 0) - (Number(old.adminPrice) || 0)
        valueDelta += delta
        return { ...g, shipments, total: g.total + delta }
      })
      return { ...prev, groups, totalValue: prev.totalValue + valueDelta }
    })
  }
  async function saveRow() {
    if (!rowEdit) return
    setRowBusy(true); setRowError('')
    const res = await fetch('/api/admin/arrived', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rowEdit.id, trackCode: rowEdit.code, adminPrice: rowEdit.price }),
    }).catch(() => null)
    setRowBusy(false)
    if (!res) { setRowError('Сүлжээний алдаа'); return }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setRowError(data.error || 'Хадгалж чадсангүй'); return }
    patchRow(rowEdit.id, data.trackCode, data.adminPrice == null ? null : Number(data.adminPrice))
    setRowEdit(closeHandoverEdit())
  }
  function startRowEdit(s: Shipment) {
    setRowError('')
    setRowEdit(openHandoverEdit(s))
  }
  function cancelRowEdit() {
    setRowError('')
    setRowEdit(closeHandoverEdit())
  }
  function renderRow(s: Shipment, extra?: { onDelete?: () => void; checked?: boolean; onCheck?: () => void }) {
    const editing = isRowEditing(rowEdit, s.id)
    const draft = editing && rowEdit ? rowEdit : null
    return (
      <div className="ho-row" data-testid={editing ? 'handover-edit' : 'handover-read'}>
        <RowContext s={s} />
        {draft ? (
          <form className="ho-form" onSubmit={e => { e.preventDefault(); saveRow() }}>
            <label className="ho-field">
              <span>Трак код</span>
              <input className="input" aria-label="Трак код" value={draft.code} spellCheck={false}
                onChange={e => setRowEdit(cur => cur && cur.id === s.id ? { ...cur, code: e.target.value } : cur)}
                style={{ fontFamily: 'monospace' }} />
            </label>
            <label className="ho-field">
              <span>Үнэ ₮</span>
              <span className="ho-money">
                <b aria-hidden>₮</b>
                <input className="input" inputMode="decimal" aria-label="Үнэ" value={draft.price} placeholder="0"
                  onChange={e => setRowEdit(cur => cur && cur.id === s.id ? { ...cur, price: e.target.value } : cur)} />
              </span>
            </label>
            <div className="ho-actions">
              <button className="btn" type="submit" disabled={rowBusy}>{rowBusy ? '...' : 'Хадгалах'}</button>
              <button className="btn-ghost" type="button" onClick={cancelRowEdit}>Болих</button>
              {extra?.onDelete && (
                <button type="button" className="hit-pad" aria-label={`${s.trackCode} устгах`} title="Устгах" onClick={extra.onDelete}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.2rem' }}>✕</button>
              )}
            </div>
            {rowError && <span role="alert" style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{rowError}</span>}
          </form>
        ) : (
          <div className="ho-read">
            <strong className="ho-code">{s.trackCode}</strong>
            <span className="ho-amt">{s.adminPrice ? `₮${Number(s.adminPrice).toLocaleString()}` : '—'}</span>
            <button type="button" className="hit-pad" aria-label={`${s.trackCode} засах`} title="Засах" onClick={() => startRowEdit(s)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '0.2rem' }}>
              <Pencil size={15} strokeWidth={2} />
            </button>
            {extra?.onDelete && (
              <button type="button" className="hit-pad" aria-label={`${s.trackCode} устгах`} title="Устгах" onClick={extra.onDelete}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '0.2rem' }}>✕</button>
            )}
            {extra?.onCheck && (
              <label style={{ display: 'inline-flex', flexShrink: 0 }}>
                <input type="checkbox" aria-label={`${s.trackCode} сонгох`} checked={!!extra.checked} onChange={extra.onCheck}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }} />
              </label>
            )}
          </div>
        )}
        {!editing && s.description && <div className="ho-note" style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{s.description}</div>}
      </div>
    )
  }

  function loadSummary(pg = 1) {
    fetch(`/api/admin/handover?summary=1&page=${pg}`)
      .then(r => r.json()).then(data => { setSummary(data); setSummaryPage(pg) }).catch(() => { })
  }
  function loadToday() {
    fetch('/api/admin/handover?today=1').then(r => r.json()).then(setToday).catch(() => { })
  }
  useEffect(() => { loadSummary(); loadToday() }, [])

  // Focus scanner input when switching to scanner mode
  useEffect(() => {
    if (mode === 'scanner') setTimeout(() => scanRef.current?.focus(), 50)
  }, [mode])

  // ── Search mode functions ──
  async function search(e: React.FormEvent) {
    e.preventDefault()
    await loadSearch(q)
  }
  // «Олгоход бэлэн» жагсаалтын «Олгох» товчноос ч дуудагдана — дугаарыг дахин бичих шаардлагагүй
  async function loadSearch(query: string) {
    const term = query.trim()
    if (!term) return
    setQ(term)
    setLoading(true); setError(''); setShipments([]); setSelected([]); setDone(null); setExpandedDates(new Set()); setRowEdit(closeHandoverEdit())
    const res = await fetch(`/api/admin/handover?q=${encodeURIComponent(term)}`).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setLoading(false); setSearched(true)
    if (!res || !res.ok) { setError(data.error || 'Хайж чадсангүй. Дахин оролдоно уу.'); return }
    setShipments(data)
    setSelected(data.map((s: Shipment) => s.id)) // auto-select all (олгохын өмнө баталгаажуулах цонх гарна)
    // ≤10 ачаа бол огнооны бүлгүүдийг нээлттэй харуулна — ажилтан юу олгож буйгаа харна
    if (data.length <= 10) setExpandedDates(new Set(data.map((s: Shipment) => dateKey(s))))
  }

  function toggle(id: number) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const allSelected = shipments.length > 0 && selected.length === shipments.length
  function toggleAll() {
    setSelected(allSelected ? [] : shipments.map(s => s.id))
  }

  const selectedItems = shipments.filter(s => selected.includes(s.id))
  const total = selectedItems.reduce((sum, s) => sum + (s.adminPrice ? Number(s.adminPrice) : 0), 0)
  const searchQuote = useHandoverQuote(selected)

  async function handover() {
    if (selected.length === 0 || searchQuote.blocked) return
    const ids = [...selected]
    const who = handoverPhoneGroupLabel(shipments.find(s => selected.includes(s.id))?.phone).label
    const paidMnt = searchQuote.enabled ? searchQuote.netTotal : total
    // Буруу/давхар олголтоос сэргийлэх баталгаажуулалт (буцаах нь «Олгосон» түүх эсвэл 10 сек «Буцаах»)
    if (!await confirmAsync({ title: `${who} — ${ids.length} ачаа олгох уу?`, message: `Төлөх дүн: ₮${paidMnt.toLocaleString()}`, confirmLabel: `Олгох (${ids.length})`, danger: false })) return
    setLoading(true); setError('')
    // Сүлжээ тасарвал ижил requestKey-ээр дахин илгээнэ — давхар баримт/оноо үүсэхгүй
    const res = await fetch('/api/admin/handover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchQuote.body()),
    }).catch(() => null)
    setLoading(false)
    if (!res) { setError('Сүлжээний алдаа — дахин дарна уу (давхар олгогдохгүй)'); return }
    if (res.ok) { const d = await res.json().catch(() => null); searchQuote.reset(); setDone({ result: d ?? { count: ids.length, receipts: [], balances: null }, shipmentIds: ids, who, paidMnt, at: Date.now() }); setShipments([]); setSelected([]); setSearched(false); setQ(''); loadSummary(); loadToday() }
    else { const d = await res.json().catch(() => ({})); setError(d.error || 'Олгож чадсангүй. Дахин оролдоно уу.'); searchQuote.refresh() }
  }

  // ── Scanner mode functions ──
  async function scanSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = scanInput.trim().toUpperCase()
    if (!code) return
    setScanInput('')
    if (scanned.some(s => s.trackCode === code)) {
      setScanMsg({ text: `${code} — аль хэдийн нэмэгдсэн`, ok: false })
      return
    }
    const res = await fetch(`/api/admin/handover?q=${encodeURIComponent(code)}`)
    const data = await res.json()
    if (!res.ok || !Array.isArray(data) || data.length === 0) {
      setScanMsg({ text: `${code} — олдсонгүй`, ok: false })
      return
    }
    const found = data.find((s: Shipment) => s.trackCode === code) ?? data[0]
    setScanned(prev => [...prev, found])
    setScanMsg({ text: `✓ ${found.trackCode}${found.adminPrice ? ` — ₮${Number(found.adminPrice).toLocaleString()}` : ''}`, ok: true })
    setTimeout(() => scanRef.current?.focus(), 30)
  }

  const scanTotal = scanned.reduce((s, r) => s + (r.adminPrice ? Number(r.adminPrice) : 0), 0)
  const scanQuote = useHandoverQuote(scanned.map(s => s.id))

  async function scanHandover() {
    if (scanned.length === 0 || scanQuote.blocked) return
    const ids = scanned.map(s => s.id)
    const phones = [...new Set(scanned.map(s => s.phone).filter(Boolean))]
    const who = phones.length === 1 ? phones[0]! : phones.length > 1 ? `${phones.length} хэрэглэгч` : 'Сканнер'
    const paidMnt = scanQuote.enabled ? scanQuote.netTotal : scanTotal
    if (!await confirmAsync({ title: `${who} — ${ids.length} ачаа олгох уу?`, message: `Төлөх дүн: ₮${paidMnt.toLocaleString()}`, confirmLabel: `Олгох (${ids.length})`, danger: false })) return
    setScanLoading(true)
    const res = await fetch('/api/admin/handover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scanQuote.body()),
    }).catch(() => null)
    setScanLoading(false)
    if (!res) { setScanMsg({ text: 'Сүлжээний алдаа — дахин дарна уу (давхар олгогдохгүй)', ok: false }); return }
    if (res.ok) { const d = await res.json().catch(() => null); scanQuote.reset(); setScanDone({ result: d ?? { count: ids.length, receipts: [], balances: null }, shipmentIds: ids, who, paidMnt, at: Date.now() }); setScanned([]); setScanMsg(null); loadSummary(); loadToday() }
    else { const d = await res.json().catch(() => ({})); setScanMsg({ text: d.error || 'Олгож чадсангүй. Дахин оролдоно уу.', ok: false }); scanQuote.refresh() }
  }

  return (
    <div className="page-wide">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <h1 className="section-title" style={{ margin: 0 }}>Ачаа олгох</h1>
        {today && today.shipments > 0 && (
          <>
            <span style={{ fontSize: '0.75rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.2rem 0.75rem', color: 'var(--muted)' }}>
              Өнөөдөр <strong style={{ color: 'var(--text)' }}>{today.shipments}</strong> ачаа
            </span>
            <span style={{ fontSize: '0.75rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.2rem 0.75rem', color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--text)' }}>{today.customers}</strong> хэрэглэгч
            </span>
            <span style={{ fontSize: '0.75rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.2rem 0.75rem', color: 'var(--muted)' }}>
              ₮<strong style={{ color: 'var(--accent)' }}>{today.value.toLocaleString()}</strong>
            </span>
          </>
        )}
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem' }}>
        {(['search', 'scanner'] as const).map(m => (
          <button key={m} onClick={() => { setMode(m); setDone(null); setScanDone(null) }} style={{
            padding: '0.35rem 1rem', borderRadius: '100px', fontSize: '0.82rem', fontFamily: 'inherit',
            border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}`,
            background: mode === m ? 'var(--accent)' : 'var(--surface)',
            color: mode === m ? 'var(--on-accent)' : 'var(--muted)',
            cursor: 'pointer', fontWeight: mode === m ? 700 : 400,
          }}>
            {m === 'search' ? 'Утсаар хайх' : <><ScanLine size={14} strokeWidth={2.2} style={{ verticalAlign: '-2px', marginRight: 5, flexShrink: 0 }} />Сканнер</>}
          </button>
        ))}
      </div>

      {/* ── SEARCH MODE ── */}
      {mode === 'search' && (
        <>
          <form onSubmit={search} style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.5rem', maxWidth: 420 }}>
            <Combobox ariaLabel="Утасны дугаар эсвэл трак код" placeholder="Утасны дугаар эсвэл трак код" required
              value={q} onChange={setQ} load={suggestCustomers}
              onPick={opt => { void loadSearch(opt.value) }} />
            <button className="btn" type="submit" disabled={loading} style={{ flexShrink: 0 }}>Хайх</button>
          </form>

          {error && <p className="msg-error" style={{ marginBottom: '1rem' }}>{error}</p>}
          {done && <HandoverDone info={done} onUndone={() => { loadSummary(); loadToday() }} />}
          {searched && shipments.length === 0 && !done && <p className="empty" style={{ padding: '1.5rem 0' }}>Ирсэн бараа олдсонгүй.</p>}

          {shipments.length > 0 && (
            <div className="handover-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem', alignItems: 'start', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {/* Header row with select-all */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                  {(() => {
                    const head = handoverPhoneGroupLabel(shipments[0].phone)
                    return (
                      <span style={{ fontWeight: 700, fontFamily: head.phoneLess ? 'inherit' : 'monospace', fontSize: '0.95rem', color: head.phoneLess ? 'var(--danger)' : undefined }}>
                        {head.label}
                      </span>
                    )
                  })()}
                  <span style={{ fontSize: '0.78rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.15rem 0.65rem', color: 'var(--muted)' }}>
                    Нийт <strong style={{ color: 'var(--text)' }}>{shipments.length}</strong> ачаа
                  </span>
                  {shipments.reduce((s, x) => s + (x.adminPrice ? Number(x.adminPrice) : 0), 0) > 0 && (
                    <span style={{ fontSize: '0.78rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.15rem 0.65rem', color: 'var(--muted)' }}>
                      ₮<strong style={{ color: 'var(--accent)' }}>{shipments.reduce((s, x) => s + (x.adminPrice ? Number(x.adminPrice) : 0), 0).toLocaleString()}</strong>
                    </span>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', marginLeft: 'auto' }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Бүгд</span>
                  </label>
                </div>

                {(() => {
                  const isPhoneSearch = /^\d{8}$/.test(q.trim())
                  if (!isPhoneSearch) return shipments.map(s => (
                    <div key={s.id} className="card">
                      {renderRow(s, { checked: selected.includes(s.id), onCheck: () => toggle(s.id) })}
                    </div>
                  ))
                  const byDate = new Map<string, Shipment[]>()
                  for (const s of shipments) {
                    const d = dateKey(s)
                    if (!byDate.has(d)) byDate.set(d, [])
                    byDate.get(d)!.push(s)
                  }
                  return Array.from(byDate.entries()).map(([date, items]) => {
                    const parsed = date ? new Date(date) : null
                    const label = parsed && !Number.isNaN(parsed.getTime())
                      ? `${parsed.getFullYear().toString().slice(2)}.${parsed.getMonth()+1}.${parsed.getDate()}`
                      : 'Огноогүй'
                    const dayTotal = items.reduce((sum, s) => sum + (s.adminPrice ? Number(s.adminPrice) : 0), 0)
                    const isOpen = expandedDates.has(date)
                    function toggleDate() {
                      setRowEdit(closeHandoverEdit())
                      setExpandedDates(prev => {
                        const next = new Set(prev)
                        isOpen ? next.delete(date) : next.add(date)
                        return next
                      })
                    }
                    return (
                      <div key={date} className="card" style={{ overflow: 'hidden', marginBottom: '0.5rem' }}>
                        <button type="button" onClick={toggleDate} aria-expanded={isOpen} data-testid="handover-date-group" className="handover-row-btn" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', minHeight: 44, cursor: 'pointer', background: isOpen ? 'var(--surface2)' : 'var(--surface)', userSelect: 'none' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.6rem', color: 'var(--muted)', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                            {label} · {items.length} бараа
                          </span>
                          {dayTotal > 0 && <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.88rem' }}>₮{dayTotal.toLocaleString()}</span>}
                        </button>
                        {isOpen && items.map((s) => (
                          <div key={s.id} style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                            {renderRow(s, { checked: selected.includes(s.id), onCheck: () => toggle(s.id) })}
                          </div>
                        ))}
                      </div>
                    )
                  })
                })()}
              </div>

              <div className="card" style={{ position: 'sticky', top: 72, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 100px)' }}>
                <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 }}>Сонгогдсон бараа</div>
                {selectedItems.length === 0 ? (
                  <div style={{ padding: '1.2rem', color: 'var(--muted)', fontSize: '0.85rem' }}>Бараа сонгоогүй байна</div>
                ) : (
                  <>
                    <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
                      <div className="card-row">
                        <strong>Нийт</strong>
                        <strong style={{ color: 'var(--accent)' }}>₮{total.toLocaleString()}</strong>
                      </div>
                      <HandoverLoyaltyPanel q={searchQuote} />
                      <div style={{ padding: '0.75rem 1rem' }}>
                        <button className="btn" style={{ width: '100%' }} onClick={handover} disabled={loading || searchQuote.blocked}>
                          {loading ? '...' : searchQuote.enabled ? `Олгох (${selectedItems.length}) — төлөх ₮${searchQuote.netTotal.toLocaleString()}` : `Олгох (${selectedItems.length})`}
                        </button>
                      </div>
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                      {selectedItems.map(s => (
                        <div key={s.id} className="card-row" style={{ fontSize: '0.82rem' }}>
                          <span style={{ fontFamily: 'monospace' }}>{s.trackCode}</span>
                          <span>{s.adminPrice ? `₮${Number(s.adminPrice).toLocaleString()}` : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── SCANNER MODE ── */}
      {mode === 'scanner' && (
        <div style={{ maxWidth: 520 }}>
          {scanDone && <HandoverDone info={scanDone} onUndone={() => { loadSummary(); loadToday() }} style={{ maxWidth: 'none', marginBottom: '1rem' }} />}

          <form onSubmit={scanSubmit} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <input
              ref={scanRef}
              className="input"
              placeholder="Баркод уншуулах..."
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              autoComplete="off"
              style={{ fontFamily: 'monospace' }}
            />
            <button className="btn" type="submit" style={{ flexShrink: 0 }}>Нэмэх</button>
          </form>

          {scanMsg && (
            <p style={{ fontSize: '0.82rem', marginBottom: '0.75rem', color: scanMsg.ok ? 'var(--green)' : 'var(--danger)' }}>
              {scanMsg.text}
            </p>
          )}

          {scanned.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  {scanned.length} ачаа &nbsp;·&nbsp;
                  <span style={{ color: 'var(--accent)' }}>₮{scanTotal.toLocaleString()}</span>
                </span>
                <button onClick={() => { setScanned([]); setScanMsg(null); setScanDone(null); setTimeout(() => scanRef.current?.focus(), 30) }}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.3rem 0.75rem', fontSize: '0.78rem', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Цэвэрлэх
                </button>
              </div>

              <div className="card" style={{ overflow: 'hidden', marginBottom: '0.75rem' }}>
                {scanned.map((s, i) => (
                  <div key={s.id} style={{ borderBottom: i < scanned.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    {renderRow(s, { onDelete: () => setScanned(prev => prev.filter(r => r.id !== s.id)) })}
                  </div>
                ))}
              </div>

              {scanQuote.enabled && <div className="card" style={{ overflow: 'hidden', marginBottom: '0.75rem' }}><HandoverLoyaltyPanel q={scanQuote} /></div>}
              <button className="btn" style={{ width: '100%' }} onClick={scanHandover} disabled={scanLoading || scanQuote.blocked}>
                {scanLoading ? '...' : `Олгох (${scanned.length}) — ${scanQuote.enabled ? 'төлөх ' : ''}₮${(scanQuote.enabled ? scanQuote.netTotal : scanTotal).toLocaleString()}`}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── SUMMARY ── */}
      {summary && summary.totalShipments > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Олгоход бэлэн</h2>
            <span style={{ fontSize: '0.78rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.2rem 0.7rem', color: 'var(--muted)' }}>
              Нийт <strong style={{ color: 'var(--text)' }}>{summary.totalShipments}</strong> ачаа
            </span>
            <span style={{ fontSize: '0.78rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.2rem 0.7rem', color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--text)' }}>{summary.totalCustomers}</strong> хэрэглэгч
            </span>
            <span style={{ fontSize: '0.78rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.2rem 0.7rem', color: 'var(--muted)' }}>
              Нийт дүн <strong style={{ color: 'var(--accent)' }}>₮{summary.totalValue.toLocaleString()}</strong>
            </span>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            {summary.groups.map((g, i) => {
              const phoneGroup = handoverPhoneGroupLabel(g.phone)
              return (
              <div key={g.phone} data-testid="handover-summary-row" style={{
                display: 'flex', alignItems: 'stretch', flexWrap: 'wrap',
                borderBottom: (expandedPhone === g.phone || i < summary.groups.length - 1) ? '1px solid var(--border)' : 'none',
                background: phoneGroup.phoneLess
                  ? 'color-mix(in srgb, var(--danger) 8%, var(--surface))'
                  : expandedPhone === g.phone ? 'var(--surface2)' : 'var(--surface)',
                boxShadow: phoneGroup.phoneLess ? 'inset 3px 0 0 var(--danger)' : undefined,
              }}>
                <button type="button" className="handover-row-btn" aria-expanded={expandedPhone === g.phone}
                  onClick={() => { setRowEdit(closeHandoverEdit()); setExpandedPhone(expandedPhone === g.phone ? null : g.phone) }} style={{
                  flex: 1, minWidth: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.75rem 0.6rem 0.75rem 1.2rem', minHeight: 44,
                  cursor: 'pointer', background: 'transparent',
                  transition: 'background 0.12s', gap: '0.5rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="hs-idx" style={{ fontSize: '0.72rem', color: 'var(--muted)', width: 22, textAlign: 'right', flexShrink: 0 }}>{(summaryPage - 1) * 20 + i + 1}</span>
                    <span style={{ fontSize: '0.65rem', color: phoneGroup.phoneLess ? 'var(--danger)' : 'var(--muted)', display: 'inline-block', transform: expandedPhone === g.phone ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: phoneGroup.phoneLess ? 'var(--danger)' : undefined }}>{phoneGroup.label}</span>
                    <span className="status-group-count">{g.count} ачаа</span>
                  </div>
                  <strong style={{ color: g.total > 0 ? 'var(--accent)' : 'var(--muted)', fontSize: '0.88rem', flexShrink: 0 }}>
                    {g.total > 0 ? `₮${g.total.toLocaleString()}` : '—'}
                  </strong>
                </button>
                <button type="button" className="btn btn-sm handover-row-give" data-testid="handover-summary-give"
                  aria-label={`${phoneGroup.label} — ${g.count} ачаа олгох`}
                  onClick={() => {
                    setMode('search'); setScanDone(null); setDone(null); setRowEdit(closeHandoverEdit())
                    if (phoneGroup.phoneLess) {
                      setQ(''); setError(''); setSearched(true); setShipments(g.shipments)
                      setSelected(g.shipments.map(s => s.id))
                      setExpandedDates(g.shipments.length <= 10 ? new Set(g.shipments.map(dateKey)) : new Set())
                    } else {
                      void loadSearch(g.phone)
                    }
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}>
                  Олгох
                </button>
                {expandedPhone === g.phone && (
                  <div style={{ flexBasis: '100%', borderTop: '1px solid var(--border)' }}>
                    {g.shipments.map((s, si) => (
                      <div key={s.id} style={{
                        borderBottom: si < g.shipments.length - 1 ? '1px solid var(--border)' : 'none',
                        background: 'var(--bg)',
                      }}>
                        {renderRow(s)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )
            })}
          </div>

          {summary.totalGroups > 20 && (
            <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', alignItems: 'center', marginTop: '1rem' }}>
              {Array.from({ length: Math.ceil(summary.totalGroups / 20) }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => { setRowEdit(closeHandoverEdit()); setExpandedPhone(null); loadSummary(p) }} style={{
                  padding: '0.3rem 0.65rem', borderRadius: '6px',
                  border: `1px solid ${summaryPage === p ? 'var(--accent)' : 'var(--border)'}`,
                  background: summaryPage === p ? 'var(--accent)' : 'var(--surface)',
                  color: summaryPage === p ? 'var(--on-accent)' : 'var(--text)',
                  fontWeight: summaryPage === p ? 700 : 400,
                  cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit',
                }}>{p}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

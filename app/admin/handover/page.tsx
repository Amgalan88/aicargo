'use client'
import { useState, useEffect, useRef } from 'react'

interface Shipment {
  id: number
  trackCode: string
  description: string | null
  adminPrice: number | null
  adminNote: string | null
  phone: string | null
  updatedAt: string
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
  const [done, setDone] = useState(false)

  // ── Scanner mode ──
  const scanRef = useRef<HTMLInputElement>(null)
  const [scanInput, setScanInput] = useState('')
  const [scanned, setScanned] = useState<Shipment[]>([])
  const [scanMsg, setScanMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [scanDone, setScanDone] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)

  // ── Summary ──
  const [summary, setSummary] = useState<Summary | null>(null)
  const [summaryPage, setSummaryPage] = useState(1)
  const [expandedPhone, setExpandedPhone] = useState<string | null>(null)
  const [today, setToday] = useState<TodayStats | null>(null)

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
    setLoading(true); setError(''); setShipments([]); setSelected([]); setDone(false); setExpandedDates(new Set())
    const res = await fetch(`/api/admin/handover?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    setLoading(false); setSearched(true)
    if (!res.ok) { setError(data.error); return }
    setShipments(data)
    setSelected(data.map((s: Shipment) => s.id)) // auto-select all
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

  async function handover() {
    if (selected.length === 0) return
    setLoading(true)
    const res = await fetch('/api/admin/handover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentIds: selected }),
    })
    setLoading(false)
    if (res.ok) { setDone(true); setShipments([]); setSelected([]); setSearched(false); setQ(''); loadSummary(); loadToday() }
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

  async function scanHandover() {
    if (scanned.length === 0) return
    setScanLoading(true)
    const res = await fetch('/api/admin/handover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentIds: scanned.map(s => s.id) }),
    })
    setScanLoading(false)
    if (res.ok) { setScanDone(true); setScanned([]); setScanMsg(null); loadSummary(); loadToday() }
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
          <button key={m} onClick={() => { setMode(m); setDone(false); setScanDone(false) }} style={{
            padding: '0.35rem 1rem', borderRadius: '100px', fontSize: '0.82rem', fontFamily: 'inherit',
            border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}`,
            background: mode === m ? 'var(--accent)' : 'var(--surface)',
            color: mode === m ? '#fff' : 'var(--muted)',
            cursor: 'pointer', fontWeight: mode === m ? 700 : 400,
          }}>
            {m === 'search' ? 'Утсаар хайх' : '📷 Сканнер'}
          </button>
        ))}
      </div>

      {/* ── SEARCH MODE ── */}
      {mode === 'search' && (
        <>
          <form onSubmit={search} style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.5rem', maxWidth: 420 }}>
            <input className="input" placeholder="Утасны дугаар эсвэл трак код" required
              value={q} onChange={e => setQ(e.target.value)} />
            <button className="btn" type="submit" disabled={loading} style={{ flexShrink: 0 }}>Хайх</button>
          </form>

          {error && <p className="msg-error" style={{ marginBottom: '1rem' }}>{error}</p>}
          {done && <div className="card" style={{ maxWidth: 400, marginBottom: '1.5rem' }}><div className="card-row"><span className="msg-success" style={{ margin: 0 }}>Амжилттай олгогдлоо.</span></div></div>}
          {searched && shipments.length === 0 && !done && <p className="empty" style={{ padding: '1.5rem 0' }}>Ирсэн бараа олдсонгүй.</p>}

          {shipments.length > 0 && (
            <div className="handover-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem', alignItems: 'start', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {/* Header row with select-all */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.95rem' }}>{shipments[0].phone ?? q}</span>
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
                    <label key={s.id} className="card" style={{ cursor: 'pointer', display: 'block', padding: '0.6rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <strong style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{s.trackCode}</strong>
                            <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{s.phone ?? '—'}</span>
                            <span className="admin-item-date">{fmtDT(s.updatedAt)}</span>
                          </div>
                          {s.adminNote && <div style={{ fontSize: '0.8rem', color: 'var(--accent)', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.adminNote}</div>}
                        </div>
                        <span style={{ fontWeight: 700, color: s.adminPrice ? 'var(--accent)' : 'var(--muted)', flexShrink: 0, fontSize: '0.9rem' }}>
                          {s.adminPrice ? `₮${Number(s.adminPrice).toLocaleString()}` : '—'}
                        </span>
                        <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)}
                          style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }} />
                      </div>
                    </label>
                  ))
                  const byDate = new Map<string, Shipment[]>()
                  for (const s of shipments) {
                    const d = new Date(s.updatedAt).toLocaleDateString('en-CA')
                    if (!byDate.has(d)) byDate.set(d, [])
                    byDate.get(d)!.push(s)
                  }
                  return Array.from(byDate.entries()).map(([date, items]) => {
                    const d = new Date(date)
                    const label = `${d.getFullYear().toString().slice(2)}.${d.getMonth()+1}.${d.getDate()}`
                    const dayTotal = items.reduce((sum, s) => sum + (s.adminPrice ? Number(s.adminPrice) : 0), 0)
                    const isOpen = expandedDates.has(date)
                    function toggleDate() {
                      setExpandedDates(prev => {
                        const next = new Set(prev)
                        isOpen ? next.delete(date) : next.add(date)
                        return next
                      })
                    }
                    return (
                      <div key={date} className="card" style={{ overflow: 'hidden', marginBottom: '0.5rem' }}>
                        <div onClick={toggleDate} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', cursor: 'pointer', background: isOpen ? 'var(--surface2)' : 'var(--surface)', userSelect: 'none' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.6rem', color: 'var(--muted)', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                            {label} · {items.length} бараа
                          </span>
                          {dayTotal > 0 && <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.88rem' }}>₮{dayTotal.toLocaleString()}</span>}
                        </div>
                        {isOpen && items.map((s) => (
                          <label key={s.id} style={{ cursor: 'pointer', display: 'block', padding: '0.55rem 1rem', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <strong style={{ fontFamily: 'monospace', fontSize: '0.88rem' }}>{s.trackCode}</strong>
                                {s.adminNote && <div style={{ fontSize: '0.78rem', color: 'var(--accent)', marginTop: '0.1rem' }}>{s.adminNote}</div>}
                              </div>
                              <span style={{ fontWeight: 700, color: s.adminPrice ? 'var(--accent)' : 'var(--muted)', flexShrink: 0, fontSize: '0.88rem' }}>
                                {s.adminPrice ? `₮${Number(s.adminPrice).toLocaleString()}` : '—'}
                              </span>
                              <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)}
                                style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }} />
                            </div>
                          </label>
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
                      <div style={{ padding: '0.75rem 1rem' }}>
                        <button className="btn" style={{ width: '100%' }} onClick={handover} disabled={loading}>
                          {loading ? '...' : `Олгох (${selectedItems.length})`}
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
          {scanDone && <div className="card" style={{ marginBottom: '1rem' }}><div className="card-row"><span className="msg-success" style={{ margin: 0 }}>Амжилттай олгогдлоо.</span></div></div>}

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
            <p style={{ fontSize: '0.82rem', marginBottom: '0.75rem', color: scanMsg.ok ? 'var(--green, #16a34a)' : 'var(--danger)' }}>
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
                <button onClick={() => { setScanned([]); setScanMsg(null); setScanDone(false); setTimeout(() => scanRef.current?.focus(), 30) }}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.3rem 0.75rem', fontSize: '0.78rem', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Цэвэрлэх
                </button>
              </div>

              <div className="card" style={{ overflow: 'hidden', marginBottom: '0.75rem' }}>
                {scanned.map((s, i) => (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.55rem 1rem', gap: '0.5rem', fontSize: '0.83rem',
                    borderBottom: i < scanned.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{s.trackCode}</span>
                      {s.phone && <span style={{ color: 'var(--muted)' }}>{s.phone}</span>}
                      {s.adminNote && <span style={{ color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.adminNote}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      <span style={{ color: s.adminPrice ? 'var(--accent)' : 'var(--muted)', fontWeight: 600 }}>
                        {s.adminPrice ? `₮${Number(s.adminPrice).toLocaleString()}` : '—'}
                      </span>
                      <button onClick={() => setScanned(prev => prev.filter(r => r.id !== s.id))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.85rem', padding: '0.1rem 0.2rem' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>✕</button>
                    </div>
                  </div>
                ))}
              </div>

              <button className="btn" style={{ width: '100%' }} onClick={scanHandover} disabled={scanLoading}>
                {scanLoading ? '...' : `Олгох (${scanned.length}) — ₮${scanTotal.toLocaleString()}`}
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
            {summary.groups.map((g, i) => (
              <div key={g.phone}>
                <div onClick={() => setExpandedPhone(expandedPhone === g.phone ? null : g.phone)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.75rem 1.2rem',
                  borderBottom: (expandedPhone === g.phone || i < summary.groups.length - 1) ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  background: expandedPhone === g.phone ? 'var(--surface2)' : 'var(--surface)',
                  transition: 'background 0.12s', gap: '0.5rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)', width: 22, textAlign: 'right', flexShrink: 0 }}>{(summaryPage - 1) * 20 + i + 1}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted)', display: 'inline-block', transform: expandedPhone === g.phone ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{g.phone}</span>
                    <span className="status-group-count">{g.count} ачаа</span>
                  </div>
                  <strong style={{ color: g.total > 0 ? 'var(--accent)' : 'var(--muted)', fontSize: '0.88rem', flexShrink: 0 }}>
                    {g.total > 0 ? `₮${g.total.toLocaleString()}` : '—'}
                  </strong>
                </div>
                {expandedPhone === g.phone && (
                  <div style={{ borderBottom: i < summary.groups.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    {g.shipments.map((s, si) => (
                      <div key={s.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.5rem 1.2rem 0.5rem 2.8rem',
                        borderBottom: si < g.shipments.length - 1 ? '1px solid var(--border)' : 'none',
                        fontSize: '0.82rem', gap: '0.5rem', background: 'var(--bg)',
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{s.trackCode}</span>
                          {s.description && <span style={{ color: 'var(--muted)', marginLeft: '0.5rem' }}>{s.description}</span>}
                        </div>
                        <span style={{ color: s.adminPrice ? 'var(--accent)' : 'var(--muted)', fontWeight: 600, flexShrink: 0 }}>
                          {s.adminPrice ? `₮${Number(s.adminPrice).toLocaleString()}` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {summary.totalGroups > 20 && (
            <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', alignItems: 'center', marginTop: '1rem' }}>
              {Array.from({ length: Math.ceil(summary.totalGroups / 20) }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => { setExpandedPhone(null); loadSummary(p) }} style={{
                  padding: '0.3rem 0.65rem', borderRadius: '6px',
                  border: `1px solid ${summaryPage === p ? 'var(--accent)' : 'var(--border)'}`,
                  background: summaryPage === p ? 'var(--accent)' : 'var(--surface)',
                  color: summaryPage === p ? '#fff' : 'var(--text)',
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

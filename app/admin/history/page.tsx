'use client'
import { useState, useEffect, useCallback } from 'react'
import SkeletonTable from '@/app/components/SkeletonTable'

interface Row {
  id: number
  trackCode: string
  phone: string | null
  adminPrice: number | null
  adminNote: string | null
  updatedAt: string
}

interface DateGroup {
  date: string
  count: number
  value: number
  shipments: Row[]
}

const PAGE_SIZE = 20
const REPORT_PAGE = 10

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

export default function HistoryPage() {
  const [tab, setTab] = useState<'list' | 'report'>('list')

  // --- List tab ---
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [listPage, setListPage] = useState(1)

  async function revert(id: number) {
    if (!confirm('ARRIVED төлөвт буцаах уу?')) return
    const res = await fetch('/api/admin/history', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (res.ok) { setRows(prev => prev.filter(r => r.id !== id)); setTotal(t => t - 1) }
  }

  const loadList = useCallback(async (pg: number, s: string) => {
    setListLoading(true)
    const res = await fetch(`/api/admin/history?q=${encodeURIComponent(s)}&page=${pg}`)
    if (res.ok) { const d = await res.json(); setRows(d.items); setTotal(d.total) }
    setListLoading(false)
  }, [])

  useEffect(() => { loadList(1, '') }, [loadList])

  function handleListSearch(e: React.FormEvent) {
    e.preventDefault(); setListPage(1); setSearch(q); loadList(1, q)
  }
  function goListPage(p: number) { setListPage(p); loadList(p, search) }
  const listTotalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // --- Report tab ---
  const [rPhone, setRPhone] = useState('')
  const [rDate, setRDate] = useState('')
  const [rData, setRData] = useState<{ dates: DateGroup[]; totalCount: number; totalValue: number } | null>(null)
  const [rLoading, setRLoading] = useState(false)
  const [rExpandedDate, setRExpandedDate] = useState<string | null>(null)
  const [rExpandedPhone, setRExpandedPhone] = useState<string | null>(null)
  const [rPage, setRPage] = useState(1)

  async function loadReport() {
    const ph = rPhone.trim()
    if (!ph && !rDate) return
    setRLoading(true); setRData(null); setRExpandedDate(null); setRExpandedPhone(null); setRPage(1)
    const params = new URLSearchParams()
    if (ph) params.set('phone', ph)
    if (rDate) { params.set('from', rDate); params.set('to', rDate) }
    const res = await fetch(`/api/admin/report?${params}`)
    setRLoading(false)
    if (res.ok) setRData(await res.json())
  }

  const rDates = rData?.dates ?? []
  const rFiltered = rDates
  const rTotalPages = Math.max(1, Math.ceil(rFiltered.length / REPORT_PAGE))
  const rPaged = rFiltered.slice((rPage - 1) * REPORT_PAGE, rPage * REPORT_PAGE)
  const rFilteredTotal = rFiltered.reduce((s, g) => s + g.value, 0)
  const rFilteredCount = rFiltered.reduce((s, g) => s + g.count, 0)

  return (
    <div className="page-wide">
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem' }}>
        {(['list', 'report'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '0.4rem 1rem', borderRadius: '100px', fontSize: '0.82rem', fontFamily: 'inherit',
            border: `1px solid ${tab === t ? 'var(--accent)' : 'var(--border)'}`,
            background: tab === t ? 'var(--accent)' : 'var(--surface)',
            color: tab === t ? '#fff' : 'var(--muted)',
            cursor: 'pointer', fontWeight: tab === t ? 700 : 400,
          }}>
            {t === 'list' ? 'Жагсаалт' : 'Тайлан'}
          </button>
        ))}
      </div>

      {/* ── LIST TAB ── */}
      {tab === 'list' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <h1 className="section-title" style={{ margin: 0 }}>Олгосон ачаа</h1>
            {!listLoading && (
              <span style={{ fontSize: '0.75rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.2rem 0.75rem', color: 'var(--muted)' }}>
                Нийт <strong style={{ color: 'var(--text)' }}>{total}</strong> ачаа
              </span>
            )}
          </div>

          <form onSubmit={handleListSearch} style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', maxWidth: 420 }}>
            <input className="input" placeholder="Утас эсвэл трак код..." value={q} onChange={e => setQ(e.target.value)} />
            <button className="btn" type="submit" style={{ flexShrink: 0 }}>Хайх</button>
          </form>

          {listLoading ? <SkeletonTable rows={8} cols={6} /> : rows.length === 0 ? (
            <p className="empty">Олгосон ачаа байхгүй байна.</p>
          ) : (
            <>
              <div className="card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 560 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                      <th style={th}>#</th>
                      <th style={th}>Утас</th>
                      <th style={th}>Трак код</th>
                      <th style={th}>Олгосон огноо</th>
                      <th style={{ ...th, textAlign: 'right' }}>Үнэ</th>
                      <th style={th}>Тайлбар</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg)' : 'var(--surface)' }}>
                        <td style={{ ...td, color: 'var(--muted)', width: 36 }}>{(listPage - 1) * PAGE_SIZE + i + 1}</td>
                        <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {r.phone
                            ? <span onClick={() => navigator.clipboard.writeText(r.phone!)} title="Хуулах" style={{ cursor: 'pointer', fontFamily: 'monospace' }}>{r.phone}</span>
                            : '—'}
                        </td>
                        <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700 }}>{r.trackCode}</td>
                        <td style={{ ...td, color: 'var(--muted)' }}>{fmtDate(r.updatedAt)}</td>
                        <td style={{ ...td, textAlign: 'right', color: r.adminPrice ? 'var(--accent)' : 'var(--muted)', fontWeight: 600 }}>
                          {r.adminPrice ? `₮${Number(r.adminPrice).toLocaleString()}` : '—'}
                        </td>
                        <td style={{ ...td, color: 'var(--muted)' }}>{r.adminNote ?? '—'}</td>
                        <td style={{ ...td, width: 40, padding: '0.4rem 0.6rem' }}>
                          <button onClick={() => revert(r.id)} title="ARRIVED буцаах" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '1rem', padding: 0 }}>↩</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {listTotalPages > 1 && (
                <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', alignItems: 'center' }}>
                  <button onClick={() => goListPage(Math.max(1, listPage-1))} disabled={listPage===1} style={pgBtn}>‹</button>
                  {(() => {
                    const pages: (number|'...')[] = []
                    if (listTotalPages <= 7) {
                      for (let i=1; i<=listTotalPages; i++) pages.push(i)
                    } else {
                      pages.push(1)
                      if (listPage > 3) pages.push('...')
                      for (let i=Math.max(2,listPage-1); i<=Math.min(listTotalPages-1,listPage+1); i++) pages.push(i)
                      if (listPage < listTotalPages-2) pages.push('...')
                      pages.push(listTotalPages)
                    }
                    return pages.map((p,i) => p==='...'
                      ? <span key={`e${i}`} style={{ fontSize:'0.78rem', color:'var(--muted)', padding:'0 0.2rem' }}>…</span>
                      : <button key={p} onClick={() => goListPage(p)} style={{ ...pgBtn, fontWeight: listPage===p?700:400, background: listPage===p?'var(--accent)':'var(--surface)', color: listPage===p?'#fff':'var(--text)', borderColor: listPage===p?'var(--accent)':'var(--border)' }}>{p}</button>
                    )
                  })()}
                  <button onClick={() => goListPage(Math.min(listTotalPages, listPage+1))} disabled={listPage===listTotalPages} style={pgBtn}>›</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── REPORT TAB ── */}
      {tab === 'report' && (
        <>
          <h1 className="section-title">Тайлан</h1>

          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.75rem' }}>Утасны дугаар</label>
              <input className="input" placeholder="99001122" value={rPhone}
                style={{ width: 160 }}
                onChange={e => setRPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                onKeyDown={e => e.key === 'Enter' && loadReport()} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.75rem' }}>Огноо</label>
              <input className="input" type="date" value={rDate}
                style={{ width: 160 }}
                onChange={e => setRDate(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadReport()} />
            </div>
            <button className="btn" onClick={loadReport} disabled={rLoading || (!rPhone.trim() && !rDate)} style={{ height: 40 }}>
              {rLoading ? '...' : 'Харах'}
            </button>
          </div>

          {rData && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>{rFilteredCount}</strong> ачаа &nbsp;·&nbsp;
                  <strong style={{ color: 'var(--text)' }}>{new Set(rFiltered.flatMap(g => g.shipments.map(s => s.phone ?? '—'))).size}</strong> хэрэглэгч &nbsp;·&nbsp;
                  <strong style={{ color: 'var(--accent)' }}>₮{rFilteredTotal.toLocaleString()}</strong>
                </span>
              </div>

              {rPaged.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Тохирох бараа байхгүй байна.</p>
              ) : (rPhone.trim() && rDate) ? (
                // Both phone + date: flat list, no dropdown
                <div className="card" style={{ overflow: 'hidden' }}>
                  {rPaged.flatMap(g => g.shipments).map((s, si, arr) => (
                    <div key={s.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.6rem 1.2rem',
                      borderBottom: si < arr.length - 1 ? '1px solid var(--border)' : 'none',
                      fontSize: '0.83rem', gap: '0.5rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{s.trackCode}</span>
                        {s.adminNote && <span style={{ color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.adminNote}</span>}
                      </div>
                      <span style={{ color: s.adminPrice ? 'var(--accent)' : 'var(--muted)', fontWeight: 600, flexShrink: 0 }}>
                        {s.adminPrice ? `₮${Number(s.adminPrice).toLocaleString()}` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card" style={{ overflow: 'hidden' }}>
                  {rPaged.map((g, i) => {
                    // Group shipments by phone
                    const phoneMap = new Map<string, { count: number; value: number; shipments: Row[] }>()
                    for (const s of g.shipments) {
                      const key = s.phone ?? '—'
                      if (!phoneMap.has(key)) phoneMap.set(key, { count: 0, value: 0, shipments: [] })
                      const ph = phoneMap.get(key)!
                      ph.count++; ph.value += s.adminPrice ? Number(s.adminPrice) : 0; ph.shipments.push(s)
                    }
                    const phoneGroups = Array.from(phoneMap.entries())
                    const dateOpen = rExpandedDate === g.date
                    return (
                      <div key={g.date}>
                        {/* Date row */}
                        <div onClick={() => { setRExpandedDate(dateOpen ? null : g.date); setRExpandedPhone(null) }} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '0.8rem 1.2rem', cursor: 'pointer',
                          borderBottom: (dateOpen || i < rPaged.length - 1) ? '1px solid var(--border)' : 'none',
                          background: dateOpen ? 'var(--surface2)' : 'var(--surface)',
                          transition: 'background 0.12s', gap: '0.5rem',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--muted)', transform: dateOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                            <strong style={{ fontSize: '0.9rem' }}>{g.date}</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.1rem 0.55rem' }}>
                              {g.count} ачаа
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.1rem 0.55rem' }}>
                              {phoneGroups.length} хэрэглэгч
                            </span>
                          </div>
                          <strong style={{ color: g.value > 0 ? 'var(--accent)' : 'var(--muted)', fontSize: '0.9rem', flexShrink: 0 }}>
                            {g.value > 0 ? `₮${g.value.toLocaleString()}` : '—'}
                          </strong>
                        </div>
                        {/* Phone groups */}
                        {dateOpen && (
                          <div style={{ borderBottom: i < rPaged.length - 1 ? '1px solid var(--border)' : 'none' }}>
                            {phoneGroups.map(([phone, pg], pi) => {
                              const phoneKey = `${g.date}|${phone}`
                              const phoneOpen = rExpandedPhone === phoneKey
                              return (
                                <div key={phone}>
                                  <div onClick={() => setRExpandedPhone(phoneOpen ? null : phoneKey)} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '0.6rem 1.2rem 0.6rem 2.8rem', cursor: 'pointer',
                                    borderBottom: (phoneOpen || pi < phoneGroups.length - 1) ? '1px solid var(--border)' : 'none',
                                    background: phoneOpen ? 'var(--bg)' : 'var(--surface)',
                                    gap: '0.5rem',
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                      <span style={{ fontSize: '0.6rem', color: 'var(--muted)', transform: phoneOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{phone}</span>
                                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{pg.count} ачаа</span>
                                    </div>
                                    <strong style={{ color: pg.value > 0 ? 'var(--accent)' : 'var(--muted)', fontSize: '0.85rem', flexShrink: 0 }}>
                                      {pg.value > 0 ? `₮${pg.value.toLocaleString()}` : '—'}
                                    </strong>
                                  </div>
                                  {phoneOpen && (
                                    <div>
                                      {pg.shipments.map((s, si) => (
                                        <div key={s.id} style={{
                                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                          padding: '0.45rem 1.2rem 0.45rem 4.2rem',
                                          borderBottom: si < pg.shipments.length - 1 ? '1px solid var(--border)' : 'none',
                                          fontSize: '0.82rem', gap: '0.5rem', background: 'var(--bg)',
                                        }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{s.trackCode}</span>
                                            {s.adminNote && <span style={{ color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.adminNote}</span>}
                                          </div>
                                          <span style={{ color: s.adminPrice ? 'var(--accent)' : 'var(--muted)', fontWeight: 600, flexShrink: 0 }}>
                                            {s.adminPrice ? `₮${Number(s.adminPrice).toLocaleString()}` : '—'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {rTotalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center', marginTop: '0.75rem' }}>
                  <button onClick={() => { setRPage(p => Math.max(1, p-1)); setRExpandedDate(null); setRExpandedPhone(null) }} disabled={rPage===1} style={pgBtn}>‹</button>
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)', padding: '0 0.4rem' }}>{rPage} / {rTotalPages}</span>
                  <button onClick={() => { setRPage(p => Math.min(rTotalPages, p+1)); setRExpandedDate(null); setRExpandedPhone(null) }} disabled={rPage===rTotalPages} style={pgBtn}>›</button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '0.6rem 1rem', textAlign: 'left', fontSize: '0.72rem',
  fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '0.6rem 1rem', whiteSpace: 'nowrap' }
const pgBtn: React.CSSProperties = {
  padding: '0.3rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer',
  fontSize: '0.82rem', fontFamily: 'inherit',
}

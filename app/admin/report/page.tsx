'use client'
import { useState } from 'react'

interface Shipment {
  id: number; trackCode: string; phone: string | null
  adminPrice: number | null; adminNote: string | null; updatedAt: string
}
interface DateGroup { date: string; count: number; value: number; shipments: Shipment[] }
interface ReportData {
  dates: DateGroup[]
  totalCount: number
  totalValue: number
}

export default function ReportPage() {
  const [phone, setPhone] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const PAGE = 10

  async function search() {
    const ph = phone.trim()
    if (!ph) return
    setLoading(true)
    setData(null)
    setExpanded(null)
    setFilterDate('')
    setPage(1)
    const params = new URLSearchParams({ phone: ph })
    const res = await fetch(`/api/admin/report?${params}`)
    setLoading(false)
    if (res.ok) setData(await res.json())
  }

  const filteredDates = data
    ? filterDate
      ? data.dates.filter(g => g.date === filterDate.replace(/-/g, '.'))
      : data.dates
    : []

  const filteredTotal = filteredDates.reduce((s, g) => s + g.value, 0)
  const filteredCount = filteredDates.reduce((s, g) => s + g.count, 0)
  const totalPages = Math.max(1, Math.ceil(filteredDates.length / PAGE))
  const pagedDates = filteredDates.slice((page - 1) * PAGE, page * PAGE)

  return (
    <div className="page-wide" style={{ maxWidth: 600 }}>
      <h1 className="section-title">Тайлан</h1>

      {/* Phone search */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', maxWidth: 400 }}>
        <input
          className="input"
          placeholder="Утасны дугаар"
          value={phone}
          onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <button className="btn" onClick={search} disabled={loading || !phone.trim()} style={{ flexShrink: 0 }}>
          {loading ? '...' : 'Хайх'}
        </button>
      </div>

      {data && (
        <>
          {/* Date filter + summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <input
              className="input"
              type="date"
              value={filterDate}
              onChange={e => { setFilterDate(e.target.value); setExpanded(null); setPage(1) }}
              style={{ width: 160 }}
            />
            {filterDate && (
              <button onClick={() => setFilterDate('')} style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--muted)', fontFamily: 'inherit',
              }}>Цэвэрлэх</button>
            )}
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)', marginLeft: 'auto' }}>
              <strong style={{ color: 'var(--text)' }}>{filteredCount}</strong> ачаа &nbsp;·&nbsp;
              <strong style={{ color: 'var(--accent)' }}>₮{filteredTotal.toLocaleString()}</strong>
            </span>
          </div>

          {filteredDates.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              {filterDate ? 'Энэ өдөр авсан бараа байхгүй.' : 'Авсан бараа байхгүй байна.'}
            </p>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              {pagedDates.map((g, i) => (
                <div key={g.date}>
                  <div
                    onClick={() => setExpanded(expanded === g.date ? null : g.date)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.8rem 1.2rem', cursor: 'pointer',
                      borderBottom: (expanded === g.date || i < pagedDates.length - 1) ? '1px solid var(--border)' : 'none',
                      background: expanded === g.date ? 'var(--surface2)' : 'var(--surface)',
                      transition: 'background 0.12s', gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--muted)', transform: expanded === g.date ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                      <strong style={{ fontSize: '0.9rem' }}>{g.date}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.1rem 0.55rem' }}>
                        {g.count} ачаа
                      </span>
                    </div>
                    <strong style={{ color: g.value > 0 ? 'var(--accent)' : 'var(--muted)', fontSize: '0.9rem', flexShrink: 0 }}>
                      {g.value > 0 ? `₮${g.value.toLocaleString()}` : '—'}
                    </strong>
                  </div>

                  {expanded === g.date && (
                    <div style={{ borderBottom: i < pagedDates.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      {g.shipments.map((s, si) => (
                        <div key={s.id} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '0.5rem 1.2rem 0.5rem 2.8rem',
                          borderBottom: si < g.shipments.length - 1 ? '1px solid var(--border)' : 'none',
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
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center', marginTop: '0.75rem' }}>
              <button onClick={() => { setPage(p => Math.max(1, p-1)); setExpanded(null) }} disabled={page === 1} style={{
                height: 32, padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border)',
                background: 'var(--surface)', cursor: page === 1 ? 'not-allowed' : 'pointer',
                opacity: page === 1 ? 0.4 : 1, fontSize: '0.82rem', color: 'var(--text)', fontFamily: 'inherit',
              }}>‹</button>
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)', padding: '0 0.4rem' }}>{page} / {totalPages}</span>
              <button onClick={() => { setPage(p => Math.min(totalPages, p+1)); setExpanded(null) }} disabled={page === totalPages} style={{
                height: 32, padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border)',
                background: 'var(--surface)', cursor: page === totalPages ? 'not-allowed' : 'pointer',
                opacity: page === totalPages ? 0.4 : 1, fontSize: '0.82rem', color: 'var(--text)', fontFamily: 'inherit',
              }}>›</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

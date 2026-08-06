'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AnimatedNumber } from '@/app/components/motion'

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

const todayStr = () => new Date().toLocaleDateString('en-CA')
const daysAgoStr = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

type Preset = 'half' | 'month' | 'custom' | null

function ReportPageInner() {
  const searchParams = useSearchParams()
  const [phone, setPhone] = useState('')
  const [preset, setPreset] = useState<Preset>(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const PAGE = 10

  function pickPreset(p: 'half' | 'month') {
    setPreset(p)
    setFromDate(daysAgoStr(p === 'half' ? 15 : 30))
    setToDate(todayStr())
  }

  async function search(override?: { phone?: string; from?: string; to?: string }) {
    const ph = (override?.phone ?? phone).trim()
    const from = override?.from ?? (preset ? fromDate : '')
    const to = override?.to ?? (preset ? toDate : '')
    if (!ph && !from && !to) { setError('Утас эсвэл хугацаа сонгоно уу'); return }
    setLoading(true)
    setError('')
    setData(null)
    setExpanded(null)
    setFilterDate('')
    setPage(1)
    const params = new URLSearchParams()
    if (ph) params.set('phone', ph)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const res = await fetch(`/api/admin/report?${params}`)
    setLoading(false)
    if (res.ok) setData(await res.json())
    else setError((await res.json().catch(() => ({}))).error || 'Алдаа гарлаа')
  }

  // AI туслахаас ирсэн deep-link: ?phone=... байвал автоматаар хайна
  useEffect(() => {
    const p = searchParams.get('phone')?.trim()
    if (p) { setPhone(p); search({ phone: p }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

      {/* Хугацаа сонгох */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '0.82rem', fontWeight: 500, display: 'block', marginBottom: '0.5rem' }}>Хугацаа</label>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
          {([['half', 'Хагас сар (сүүлийн 15 хоног)'], ['month', '1 сар (сүүлийн 30 хоног)']] as const).map(([p, label]) => (
            <button key={p} onClick={() => pickPreset(p)} style={{
              padding: '0.4rem 0.9rem', borderRadius: 100, border: '1px solid',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600,
              borderColor: preset === p ? 'var(--accent)' : 'var(--border)',
              background: preset === p ? 'var(--accent)' : 'var(--surface)',
              color: preset === p ? '#fff' : 'var(--muted)',
            }}>{label}</button>
          ))}
          <button onClick={() => setPreset('custom')} style={{
            padding: '0.4rem 0.9rem', borderRadius: 100, border: '1px solid',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600,
            borderColor: preset === 'custom' ? 'var(--accent)' : 'var(--border)',
            background: preset === 'custom' ? 'var(--accent)' : 'var(--surface)',
            color: preset === 'custom' ? '#fff' : 'var(--muted)',
          }}>Өөрөө сонгох</button>
        </div>

        {preset === 'custom' && (
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
            <input className="input" type="date" value={fromDate} max={toDate || undefined}
              onChange={e => setFromDate(e.target.value)} style={{ width: 160 }} />
            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>—</span>
            <input className="input" type="date" value={toDate} min={fromDate || undefined} max={todayStr()}
              onChange={e => setToDate(e.target.value)} style={{ width: 160 }} />
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', maxWidth: 400 }}>
          <input
            className="input"
            placeholder="Утасны дугаар (заавал биш)"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
            onKeyDown={e => e.key === 'Enter' && search()}
          />
          <button className="btn" onClick={() => search()} disabled={loading} style={{ flexShrink: 0 }}>
            {loading ? '...' : 'Харах'}
          </button>
        </div>
        {error && <p className="msg-error" style={{ marginTop: '0.5rem' }}>{error}</p>}
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
              <strong style={{ color: 'var(--text)' }}><AnimatedNumber value={filteredCount} duration={0.7} /></strong> ачаа &nbsp;·&nbsp;
              <strong style={{ color: 'var(--accent)' }}>₮<AnimatedNumber value={filteredTotal} duration={0.9} /></strong>
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

export default function ReportPage() {
  return (
    <Suspense fallback={null}>
      <ReportPageInner />
    </Suspense>
  )
}

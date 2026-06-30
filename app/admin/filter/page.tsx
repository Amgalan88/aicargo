'use client'
import { useState } from 'react'

const STATUS_LABEL: Record<string, string> = {
  ARRIVED: 'Ирсэн',
  PICKED_UP: 'Авсан',
}

interface Shipment {
  trackCode: string
  phone: string | null
  adminPrice: number | null
  description: string | null
  status: string
  updatedAt: string
  user: { name: string } | null
}

interface Result {
  shipments: Shipment[]
  total: number
  count: number
  withPriceCount: number
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function FilterPage() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`

  const [mode, setMode] = useState<'snapshot' | 'range'>('range')

  // snapshot
  const [snapDate, setSnapDate] = useState(today)
  const [snapTime, setSnapTime] = useState(`${pad(now.getHours())}:${pad(now.getMinutes())}`)

  // range
  const [fromDate, setFromDate] = useState(daysAgo(30))
  const [toDate, setToDate] = useState(today)

  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      let url = ''
      if (mode === 'snapshot') {
        url = `/api/admin/balance-snapshot?at=${encodeURIComponent(`${snapDate}T${snapTime}:00`)}`
      } else {
        url = `/api/admin/balance-range?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`
      }
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Алдаа гарлаа'); return }
      setResult(data)
    } catch {
      setError('Холболтын алдаа гарлаа.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="section-title" style={{ margin: 0 }}>Шүүлт</h1>
      </div>

      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
          {([['range', 'Хугацааны муж'], ['snapshot', 'Тодорхой цаг']] as const).map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setResult(null) }} style={{
              padding: '0.35rem 0.9rem', borderRadius: '100px', border: '1px solid',
              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              borderColor: mode === m ? 'var(--accent)' : 'var(--border)',
              background: mode === m ? 'var(--accent)' : 'var(--surface)',
              color: mode === m ? '#fff' : 'var(--muted)',
            }}>{label}</button>
          ))}
        </div>

        {mode === 'range' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Quick presets */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {([['7 хоног', 7], ['30 хоног', 30], ['60 хоног', 60], ['90 хоног', 90]] as const).map(([label, days]) => (
                <button key={days} onClick={() => setFromDate(daysAgo(days))} style={{
                  padding: '0.25rem 0.7rem', borderRadius: '100px',
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  fontSize: '0.75rem', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit',
                }}>{label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>Эхлэх огноо</label>
                <input type="date" className="input" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ width: 'auto' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>Дуусах огноо</label>
                <input type="date" className="input" value={toDate} onChange={e => setToDate(e.target.value)} style={{ width: 'auto' }} />
              </div>
              <button className="btn" onClick={load} disabled={loading}>{loading ? '...' : 'Шүүх'}</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>Огноо</label>
              <input type="date" className="input" value={snapDate} onChange={e => setSnapDate(e.target.value)} style={{ width: 'auto' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>Цаг</label>
              <input type="time" className="input" value={snapTime} onChange={e => setSnapTime(e.target.value)} style={{ width: 'auto' }} />
            </div>
            <button className="btn" onClick={load} disabled={loading}>{loading ? '...' : 'Шүүх'}</button>
          </div>
        )}
        {error && <p className="msg-error" style={{ marginTop: '0.75rem' }}>{error}</p>}
      </div>

      {result && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{result.count}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.3rem' }}>Нийт ачаа</div>
            </div>
            <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>{result.withPriceCount}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.3rem' }}>Үнэтэй ачаа</div>
            </div>
            <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>₮{result.total.toLocaleString()}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.3rem' }}>Нийт дүн</div>
            </div>
          </div>

          {result.shipments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {result.shipments.map(s => (
                <div key={s.trackCode} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.55rem 0.9rem', background: 'var(--surface)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius)', gap: '0.5rem',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <strong style={{ fontFamily: 'monospace', fontSize: '0.83rem' }}>{s.trackCode}</strong>
                      {s.status === 'PICKED_UP' && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.05rem 0.35rem' }}>Авсан</span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                      {s.user?.name || s.phone || '—'}
                      {s.description ? ` · ${s.description}` : ''}
                      {' · '}{fmtDate(s.updatedAt)}
                    </span>
                  </div>
                  {s.adminPrice ? (
                    <strong style={{ fontSize: '0.85rem', color: 'var(--accent)', flexShrink: 0 }}>
                      ₮{Number(s.adminPrice).toLocaleString()}
                    </strong>
                  ) : (
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)', flexShrink: 0 }}>—</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

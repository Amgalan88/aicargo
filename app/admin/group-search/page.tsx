'use client'
import { useState, useEffect } from 'react'

function getStatusLabel(arrivedLabel?: string | null, ereemLabel?: string | null): Record<string, string> {
  return {
    REGISTERED: 'Бүртгүүлсэн',
    EREEN_ARRIVED: ereemLabel || 'Эрээнд ирсэн',
    ARRIVED: arrivedLabel || 'Ирсэн',
    PICKED_UP: 'Авсан',
  }
}

interface Result {
  trackCode: string
  description: string | null
  status: string
  phone: string | null
  adminPrice: number | null
  cargoId: number
  cargoName: string
  isOwn: boolean
  updatedAt: string
  user: { name: string; phone: string } | null
}

export default function GroupSearchPage() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [arrivedLabel, setArrivedLabel] = useState<string | null>(null)
  const [ereemLabel, setEreemLabel] = useState<string | null>(null)
  const STATUS_LABEL = getStatusLabel(arrivedLabel, ereemLabel)

  useEffect(() => {
    fetch('/api/admin/settings').then(r => r.json()).then(d => { setArrivedLabel(d.arrivedLabel ?? null); setEreemLabel(d.ereemLabel ?? null) }).catch(() => {})
  }, [])

  async function search() {
    const val = q.trim()
    if (!val) return
    setLoading(true)
    setError('')
    setResults(null)
    try {
      const res = await fetch(`/api/admin/group-search?q=${encodeURIComponent(val)}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Алдаа гарлаа'); return }
      if (data.length === 0) setError('Үр дүн олдсонгүй.')
      else setResults(data)
    } catch {
      setError('Холболтын алдаа гарлаа.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="section-title" style={{ margin: 0 }}>Групп хайлт</h1>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.3rem' }}>
          Группийн бүх карго дотроос трак кодоор хайна
        </p>
      </div>

      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <input
            className="input"
            placeholder="JT5364974054841"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            autoFocus
            style={{ minWidth: 0 }}
          />
          <button className="btn" onClick={search} disabled={loading} style={{ flexShrink: 0 }}>
            {loading ? '...' : 'Хайх'}
          </button>
        </div>
        {error && <p className="msg-error" style={{ marginTop: '0.75rem' }}>{error}</p>}
      </div>

      {results && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {results.map(r => (
            <div key={`${r.cargoId}-${r.trackCode}`} style={{
              padding: '0.85rem 1rem',
              background: 'var(--surface)',
              border: '1px solid',
              borderColor: r.isOwn ? 'var(--border)' : 'var(--accent)',
              borderLeft: `4px solid ${r.isOwn ? 'var(--border)' : 'var(--accent)'}`,
              borderRadius: 'var(--radius)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <strong style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{r.trackCode}</strong>
                  {!r.isOwn && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-light)', padding: '0.1rem 0.45rem', borderRadius: '4px' }}>
                      {r.cargoName}
                    </span>
                  )}
                </div>
                <span className={`badge badge-${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                {r.phone && <span>📱 {r.phone}</span>}
                {r.user && <span>👤 {r.user.name}</span>}
                {r.description && <span>📦 {r.description}</span>}
                {r.adminPrice && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>₮{Number(r.adminPrice).toLocaleString()}</span>}
                <span>{(() => { const d = new Date(r.updatedAt); return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}` })()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

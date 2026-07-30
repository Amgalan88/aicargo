'use client'
import { useEffect, useState } from 'react'
import type { UserDict } from '@/lib/user-i18n'

interface Result {
  id: number
  trackCode: string
  description: string | null
  status: string
  adminPrice: string | number | null
  updatedAt: string
}

const STATUS_LABEL: Record<string, string> = {
  EREEN_ARRIVED: 'Эрээнд',
  ARRIVED: 'Ирсэн',
}

export default function NamelessSearch({ open, onClose, t }: { open: boolean; onClose: () => void; t: UserDict }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) { setQ(''); setResults(null) }
  }, [open])

  // Esc дарж хаах
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  function search(e: React.FormEvent) {
    e.preventDefault()
    const query = q.trim()
    if (query.length < 3) { setResults([]); return }
    setLoading(true)
    fetch(`/api/nameless-search?q=${encodeURIComponent(query)}`)
      .then(r => (r.ok ? r.json() : []))
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }

  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1001 }} aria-hidden />
      <div style={{
        position: 'fixed', top: '3.5rem', right: '1rem', zIndex: 1002,
        width: 300, maxHeight: 420, display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '12px', boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '0.6rem 0.85rem', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--surface2)',
        }}>
          <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text)' }}>{t.namelessTitle}</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1, padding: '0.1rem 0.2rem',
          }}>✕</button>
        </div>

        <form onSubmit={search} style={{ display: 'flex', gap: '0.4rem', padding: '0.6rem', borderBottom: '1px solid var(--border)' }}>
          <input className="input" value={q} onChange={e => setQ(e.target.value)}
            placeholder={t.searchPh} autoFocus
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.6rem' }} />
          <button className="btn" type="submit" disabled={loading || !q.trim()} style={{ fontSize: '0.8rem', padding: '0.4rem 0.7rem', flexShrink: 0 }}>
            {t.namelessSearchBtn}
          </button>
        </form>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0.6rem' }}>
          {results === null ? (
            <p style={{ fontSize: '0.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>{t.namelessHint}</p>
          ) : q.trim().length < 3 ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center', padding: '0.8rem 0' }}>{t.namelessMinChars}</p>
          ) : results.length === 0 ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center', padding: '0.8rem 0' }}>
              {loading ? '...' : t.namelessEmpty}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {results.map(r => (
                <div key={r.id} style={{
                  padding: '0.5rem 0.7rem', background: 'var(--bg)',
                  border: '1px solid var(--border)', borderRadius: '8px',
                  fontSize: '0.79rem', display: 'flex', flexDirection: 'column', gap: '0.15rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)' }}>{r.trackCode}</span>
                    <span style={{
                      fontSize: '0.68rem', color: 'var(--muted)', background: 'var(--surface2)',
                      border: '1px solid var(--border)', borderRadius: 100, padding: '0.05rem 0.5rem', whiteSpace: 'nowrap',
                    }}>{STATUS_LABEL[r.status] ?? r.status}</span>
                  </div>
                  {r.description && <span style={{ color: 'var(--muted)', fontSize: '0.76rem' }}>{r.description}</span>}
                  {r.adminPrice != null && (
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>₮{Number(r.adminPrice).toLocaleString()}</span>
                  )}
                </div>
              ))}
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', lineHeight: 1.5, marginTop: '0.3rem' }}>{t.namelessHint}</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

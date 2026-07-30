'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { UserDict } from '@/lib/user-i18n'

interface Result {
  id: number
  trackCode: string
  description: string | null
  status: string
  adminPrice: string | number | null
  updatedAt: string
}

export default function NamelessSearch({ open, onClose, t }: { open: boolean; onClose: () => void; t: UserDict }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[] | null>(null)
  const [loading, setLoading] = useState(false)

  function load(query: string) {
    setLoading(true)
    fetch(`/api/nameless-search?q=${encodeURIComponent(query)}`)
      .then(r => (r.ok ? r.json() : []))
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }

  // Нээгдэх бүрт бүх эзэнгүй ачааг шууд ачаална — хайлт заавал биш
  useEffect(() => {
    if (!open) { setQ(''); setResults(null); return }
    load('')
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
    load(q.trim())
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    toast.success('Хуулагдлаа')
  }

  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1001 }} aria-hidden />
      <div style={{
        position: 'fixed', top: '3.5rem', right: '1rem', bottom: '1rem', zIndex: 1002,
        width: 300, maxHeight: 620, display: 'flex', flexDirection: 'column',
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
          <button className="btn" type="submit" disabled={loading} style={{ fontSize: '0.8rem', padding: '0.4rem 0.7rem', flexShrink: 0 }}>
            {t.namelessSearchBtn}
          </button>
        </form>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0.6rem' }}>
          {results === null ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center', padding: '0.8rem 0' }}>...</p>
          ) : results.length === 0 ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center', padding: '0.8rem 0' }}>
              {loading ? '...' : t.namelessEmpty}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {results.map((r, i) => (
                <div key={r.id} style={{
                  padding: '0.5rem 0.7rem', background: 'var(--bg)',
                  border: '1px solid var(--border)', borderRadius: '8px',
                  fontSize: '0.79rem', display: 'flex', flexDirection: 'column', gap: '0.2rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, flexShrink: 0 }}>#{i + 1}</span>
                      <span onClick={() => copyCode(r.trackCode)} title="Хуулах" style={{
                        fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.3rem', minWidth: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {r.trackCode}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--muted)' }}>
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                      </span>
                    </div>
                    {r.adminPrice != null && (
                      <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>₮{Number(r.adminPrice).toLocaleString()}</span>
                    )}
                  </div>
                  {r.description && <span style={{ color: 'var(--muted)', fontSize: '0.76rem' }}>{r.description}</span>}
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

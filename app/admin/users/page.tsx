'use client'
import { useState, useEffect } from 'react'

interface User {
  id: number
  name: string
  phone: string
  email: string | null
  createdAt: string
  _count: { shipments: number }
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear().toString().slice(2)}.${d.getMonth()+1}.${d.getDate()}`
}

export default function UsersPage() {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  async function load(query = '', pg = 1) {
    setLoading(true)
    const res = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}&page=${pg}`)
    setLoading(false)
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users)
      setTotal(data.total)
    }
  }

  useEffect(() => { load() }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1); setSearch(q); load(q, 1)
  }

  function goPage(p: number) { setPage(p); load(search, p) }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="page-wide" style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <h1 className="section-title" style={{ margin: 0 }}>Хэрэглэгчид</h1>
        <span style={{ fontSize: '0.78rem', color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.2rem 0.75rem' }}>
          Нийт <strong style={{ color: 'var(--text)' }}>{total}</strong>
        </span>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', maxWidth: 420 }}>
        <input className="input" placeholder="Нэр эсвэл утасны дугаар"
          value={q} onChange={e => setQ(e.target.value)}
          style={{ minWidth: 0 }} />
        <button className="btn" type="submit" disabled={loading} style={{ flexShrink: 0 }}>
          {loading ? '...' : 'Хайх'}
        </button>
      </form>

      {users.length === 0 && !loading ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Олдсонгүй.</p>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {users.map((u, i) => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.55rem 1rem',
              borderBottom: i < users.length - 1 ? '1px solid var(--border)' : 'none',
              fontSize: '0.83rem',
            }}>
              <span style={{ fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--muted)', flexShrink: 0 }}>{u.phone}</span>
              {u._count.shipments > 0 && (
                <span style={{ fontSize: '0.72rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.1rem 0.5rem', color: 'var(--muted)', flexShrink: 0 }}>
                  {u._count.shipments} бараа
                </span>
              )}
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'monospace', flexShrink: 0 }}>{fmtDate(u.createdAt)}</span>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', alignItems: 'center', marginTop: '1rem' }}>
          <button onClick={() => goPage(Math.max(1, page-1))} disabled={page===1} style={pgBtn}>‹</button>
          {(() => {
            const pages: (number|'...')[] = []
            if (totalPages <= 7) { for (let i=1; i<=totalPages; i++) pages.push(i) }
            else {
              pages.push(1)
              if (page > 3) pages.push('...')
              for (let i=Math.max(2,page-1); i<=Math.min(totalPages-1,page+1); i++) pages.push(i)
              if (page < totalPages-2) pages.push('...')
              pages.push(totalPages)
            }
            return pages.map((p,i) => p==='...'
              ? <span key={`e${i}`} style={{ fontSize:'0.78rem', color:'var(--muted)', padding:'0 0.2rem' }}>…</span>
              : <button key={p} onClick={() => goPage(p)} style={{ ...pgBtn, fontWeight: page===p?700:400, background: page===p?'var(--accent)':'var(--surface)', color: page===p?'#fff':'var(--text)', borderColor: page===p?'var(--accent)':'var(--border)' }}>{p}</button>
            )
          })()}
          <button onClick={() => goPage(Math.min(totalPages, page+1))} disabled={page===totalPages} style={pgBtn}>›</button>
        </div>
      )}
    </div>
  )
}

const pgBtn: React.CSSProperties = {
  padding: '0.3rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer',
  fontSize: '0.82rem', fontFamily: 'inherit',
}

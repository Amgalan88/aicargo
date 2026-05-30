'use client'
import { useState, useEffect } from 'react'
import SkeletonTable from '@/app/components/SkeletonTable'

interface Row {
  id: number
  trackCode: string
  description: string | null
  createdAt: string
  user: { name: string; phone: string } | null
}

const PAGE_SIZE = 20

function fmtDate(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}.${m}.${day} ${h}:${min}`
}

export default function RegisteredPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  async function load(pg: number, s: string) {
    setLoading(true)
    const res = await fetch(`/api/admin/registered?q=${encodeURIComponent(s)}&page=${pg}`)
    if (res.ok) {
      const data = await res.json()
      setRows(data.items)
      setTotal(data.total)
    }
    setLoading(false)
  }

  useEffect(() => { load(1, '') }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(q)
    load(1, q)
  }

  function goPage(p: number) {
    setPage(p)
    load(p, search)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const paged = rows

  return (
    <div className="page-wide">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <h1 className="section-title" style={{ margin: 0 }}>Бүртгүүлсэн ачаа</h1>
        {!loading && (
          <span style={{ fontSize: '0.75rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.2rem 0.75rem', color: 'var(--muted)' }}>
            Нийт <strong style={{ color: 'var(--text)' }}>{total}</strong> ачаа
          </span>
        )}
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', maxWidth: 420 }}>
        <input className="input" placeholder="Утас, нэр эсвэл трак код..." value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn" type="submit" style={{ flexShrink: 0 }}>Хайх</button>
      </form>

      {loading ? (
        <SkeletonTable rows={8} cols={5} />
      ) : rows.length === 0 ? (
        <p className="empty">Бүртгүүлсэн ачаа байхгүй байна.</p>
      ) : (
        <>
          <div className="card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 560 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                  <th style={th}>#</th>
                  <th style={th}>Трак код</th>
                  <th style={th}>Хэрэглэгч</th>
                  <th style={th}>Утас</th>
                  <th style={th}>Тайлбар</th>
                  <th style={th}>Бүртгүүлсэн огноо</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg)' : 'var(--surface)' }}>
                    <td style={{ ...td, color: 'var(--muted)', width: 36 }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700 }}>{r.trackCode}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.user?.name ?? '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {r.user?.phone
                        ? <span onClick={() => navigator.clipboard.writeText(r.user!.phone)} title="Хуулах" style={{ cursor: 'pointer', fontFamily: 'monospace' }}>{r.user.phone}</span>
                        : '—'}
                    </td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{r.description ?? '—'}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', alignItems: 'center' }}>
              <button onClick={() => goPage(Math.max(1, page - 1))} disabled={page === 1} style={pgBtn}>‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => goPage(p)} style={{ ...pgBtn, fontWeight: page === p ? 700 : 400, background: page === p ? 'var(--accent)' : 'var(--surface)', color: page === p ? '#fff' : 'var(--text)', borderColor: page === p ? 'var(--accent)' : 'var(--border)' }}>{p}</button>
              ))}
              <button onClick={() => goPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={pgBtn}>›</button>
            </div>
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

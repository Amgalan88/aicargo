'use client'
import { useState, useEffect } from 'react'
import { Search, Users } from 'lucide-react'
import { PageHeader, Pagination, SortTh, useSort, CopyCell } from '@/app/components/ui'

interface User {
  id: number
  name: string
  phone: string
  email: string | null
  createdAt: string
  _count: { shipments: number }
}

type SortKey = 'name' | 'phone' | 'count' | 'date'

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

  const { sorted, sort, toggle } = useSort<User, SortKey>(users, (u, k) =>
    k === 'name' ? u.name : k === 'phone' ? u.phone : k === 'count' ? u._count.shipments : u.createdAt)

  return (
    <div className="page-wide" style={{ maxWidth: 820 }}>
      <PageHeader title="Хэрэглэгчид" count={total} countLabel="хэрэглэгч" />

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', maxWidth: 420 }}>
        <input className="input" placeholder="Нэр эсвэл утасны дугаар"
          value={q} onChange={e => setQ(e.target.value)}
          style={{ minWidth: 0 }} />
        <button className="btn" type="submit" disabled={loading} style={{ flexShrink: 0 }}>
          <Search size={16} />{loading ? '...' : 'Хайх'}
        </button>
      </form>

      {users.length === 0 && !loading ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Users size={26} /></div>
          <h3>{search ? `"${search}" олдсонгүй` : 'Хэрэглэгч алга'}</h3>
          <p>{search ? 'Өөр нэр эсвэл утсаар хайж үзнэ үү.' : 'Урилгын линкээ хуваалцаж хэрэглэгчдээ бүртгүүлээрэй.'}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table stack">
            <thead>
              <tr>
                <SortTh label="Нэр" k="name" sort={sort} onSort={toggle} />
                <SortTh label="Утас" k="phone" sort={sort} onSort={toggle} />
                <SortTh label="Ачаа" k="count" sort={sort} onSort={toggle} align="right" />
                <SortTh label="Бүртгүүлсэн" k="date" sort={sort} onSort={toggle} align="right" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(u => (
                <tr key={u.id}>
                  <td className="st-title" style={{ fontWeight: 600, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</td>
                  <td data-label="Утас" style={{ whiteSpace: 'nowrap' }}><CopyCell value={u.phone} /></td>
                  <td data-label="Ачаа" className="num">{u._count.shipments > 0 ? u._count.shipments : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                  <td data-label="Бүртгүүлсэн" className="num" style={{ color: 'var(--muted)' }}>{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={goPage} />
    </div>
  )
}

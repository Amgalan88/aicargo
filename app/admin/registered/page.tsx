'use client'
import { useState, useEffect } from 'react'
import { Search, ClipboardList } from 'lucide-react'
import SkeletonTable from '@/app/components/SkeletonTable'
import { PageHeader, Pagination, SortTh, useSort, CopyCell } from '@/app/components/ui'

interface Row {
  id: number
  trackCode: string
  description: string | null
  createdAt: string
  user: { name: string; phone: string } | null
}

type SortKey = 'track' | 'name' | 'phone' | 'date'

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
  const { sorted, sort, toggle } = useSort<Row, SortKey>(rows, (r, k) =>
    k === 'track' ? r.trackCode : k === 'name' ? r.user?.name : k === 'phone' ? r.user?.phone : r.createdAt)

  return (
    <div className="page-wide">
      <PageHeader
        title="Бүртгүүлсэн ачаа"
        count={loading ? undefined : total}
        countLabel="ачаа"
        sub="Хэрэглэгчид өөрсдөө бүртгүүлсэн, Эрээнд хараахан ирээгүй ачаа"
      />

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', maxWidth: 420 }}>
        <input className="input" placeholder="Утас, нэр эсвэл трак код..." value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn" type="submit" style={{ flexShrink: 0 }}><Search size={16} />Хайх</button>
      </form>

      {loading ? (
        <SkeletonTable rows={8} cols={5} />
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><ClipboardList size={26} /></div>
          <h3>{search ? `"${search}" олдсонгүй` : 'Бүртгүүлсэн ачаа байхгүй'}</h3>
          <p>{search ? 'Өөр утас, нэр эсвэл трак кодоор хайж үзнэ үү.' : 'Хэрэглэгчид ачаагаа бүртгүүлэхэд энд харагдана.'}</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table stack" style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <SortTh label="Трак код" k="track" sort={sort} onSort={toggle} />
                  <SortTh label="Хэрэглэгч" k="name" sort={sort} onSort={toggle} />
                  <SortTh label="Утас" k="phone" sort={sort} onSort={toggle} />
                  <th>Тайлбар</th>
                  <SortTh label="Бүртгүүлсэн" k="date" sort={sort} onSort={toggle} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={r.id}>
                    <td className="st-hide" style={{ color: 'var(--muted)' }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="mono st-title"><CopyCell value={r.trackCode} /></td>
                    <td data-label="Хэрэглэгч" style={{ fontWeight: 600 }}>{r.user?.name ?? '—'}</td>
                    <td data-label="Утас" style={{ whiteSpace: 'nowrap' }}>{r.user?.phone ? <CopyCell value={r.user.phone} /> : '—'}</td>
                    <td data-label="Тайлбар" style={{ color: 'var(--muted)' }}>{r.description ?? '—'}</td>
                    <td data-label="Бүртгүүлсэн" style={{ color: 'var(--muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={goPage} />
        </>
      )}
    </div>
  )
}

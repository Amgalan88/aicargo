'use client'
// Дизайн системийн жижиг бүрэлдэхүүнүүд — admin/хэрэглэгчийн хуудсууд дундаа ашиглана.
// Загвар нь globals.css доторх .page-head, .data-table, .seg зэрэг класс дээр тулгуурлана.
import { useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { toast } from 'sonner'

/* ── Хуудасны гарчиг + тоо + баруун талын үйлдэл ── */
export function PageHeader({ title, count, countLabel, sub, actions }: {
  title: ReactNode
  count?: number
  countLabel?: string
  sub?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="page-head">
      <div>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {title}
          {count !== undefined && (
            <span className="status-group-count" style={{ fontSize: 'var(--fs-xs)' }}>
              {count.toLocaleString()}{countLabel ? ` ${countLabel}` : ''}
            </span>
          )}
        </h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  )
}

/* ── Pagination — олон хуудастай үед "1 … 4 5 6 … 20" ── */
function pageWindow(page: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  if (page > 3) out.push('…')
  for (let i = Math.max(2, page - 1); i <= Math.min(total - 1, page + 1); i++) out.push(i)
  if (page < total - 2) out.push('…')
  out.push(total)
  return out
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <nav className="pager" aria-label="Хуудаслалт">
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1} aria-label="Өмнөх хуудас">
        <ChevronLeft size={16} />
      </button>
      {pageWindow(page, totalPages).map((p, i) => p === '…'
        ? <span key={`e${i}`} className="pager-gap">…</span>
        : <button key={p} onClick={() => onChange(p)} className={p === page ? 'on' : ''} aria-current={p === page ? 'page' : undefined}>{p}</button>
      )}
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} aria-label="Дараах хуудас">
        <ChevronRight size={16} />
      </button>
    </nav>
  )
}

/* ── Хүснэгтийн эрэмбэлэлт ── */
export type SortState<K extends string> = { key: K; dir: 'asc' | 'desc' } | null

export function useSort<T, K extends string>(rows: T[], get: (row: T, key: K) => string | number | null | undefined, initial: SortState<K> = null) {
  const [sort, setSort] = useState<SortState<K>>(initial)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const mul = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = get(a, sort.key), vb = get(b, sort.key)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul
      return String(va).localeCompare(String(vb), 'mn') * mul
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort])
  function toggle(key: K) {
    setSort(s => !s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null)
  }
  return { sorted, sort, toggle }
}

export function SortTh<K extends string>({ label, k, sort, onSort, align }: {
  label: ReactNode
  k: K
  sort: SortState<K>
  onSort: (k: K) => void
  align?: 'left' | 'right'
}) {
  const active = sort?.key === k
  const Icon = !active ? ArrowUpDown : sort!.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      className="sortable"
      style={align === 'right' ? { textAlign: 'right' } : undefined}
      onClick={() => onSort(k)}
      aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <Icon size={12} className="sort-ind" style={{ opacity: active ? 1 : 0.35, verticalAlign: '-1px' }} />
    </th>
  )
}

/* ── Дарахад хуулах текст (утас, трак код) ── */
export function CopyCell({ value, children, mono = true }: { value: string; children?: ReactNode; mono?: boolean }) {
  return (
    <button
      type="button"
      className={`copy-cell${mono ? ' mono' : ''}`}
      title="Хуулах"
      onClick={() => { navigator.clipboard.writeText(value).then(() => toast.success(`Хуулагдлаа: ${value}`)).catch(() => {}) }}
    >
      {children ?? value}
    </button>
  )
}

'use client'
// Тулгалтын тайлан: сонгосон Эрээний ачаанаас ирсэн / ирээгүй / илүү ирсэн — «Ирсэн» бүртгэлийн төгсгөлд болон түүхэнд
import { useState } from 'react'
import { Download } from 'lucide-react'
import * as XLSX from 'xlsx'

export type Stats = { loaded: number; arrived: number; missing: number; extra: number }
export type Item = { trackCode: string; phone: string | null; name: string | null; arrivedAt: string | null; price: number | null; result: 'arrived' | 'missing' | 'extra'; status: string | null }
export type Detail = { id: number; date: string; name: string | null; closedAt: string | null; createdByName: string; stats: Stats; items: Item[] }

export const ubDate = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10)
export const fmtDay = (iso: string) => ubDate(new Date(iso).getTime()).slice(5).replace('-', '/')
export const RESULT_LABEL = { arrived: 'Ирсэн', missing: 'Ирээгүй', extra: 'Илүү ирсэн' } as const
export const RESULT_COLOR = { arrived: 'var(--green)', missing: 'var(--danger)', extra: 'var(--orange, #c98a12)' } as const

export default function DispatchReport({ detail }: { detail: Detail }) {
  const [tab, setTab] = useState<'missing' | 'extra' | 'arrived'>(detail.stats.missing ? 'missing' : detail.stats.extra ? 'extra' : 'arrived')
  const shown = detail.items.filter(i => i.result === tab)

  function exportExcel() {
    const rows = detail.items.map((it, i) => ({
      '№': i + 1, 'Трак код': it.trackCode, 'Үр дүн': RESULT_LABEL[it.result],
      'Утас': it.phone ?? '', 'Нэр': it.name ?? '', 'Ирсэн огноо': it.arrivedAt ? ubDate(new Date(it.arrivedAt).getTime()) : '', 'Үнэ': it.price ?? '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Тулгалт')
    XLSX.writeFile(wb, `tulgalt-${ubDate(new Date(detail.date).getTime())}-${detail.id}.xlsx`)
  }

  return (
    <div style={{ display: 'grid', gap: '0.8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>Тулгалтын тайлан · {fmtDay(detail.date)}</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{detail.name}{detail.closedAt ? '' : ' · дуусаагүй'}</span>
        </div>
        <button className="btn btn-sm" onClick={exportExcel}><Download size={14} /> Excel татах</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.6rem' }}>
        {([['Сонгосон', detail.stats.loaded, 'var(--text)'], ['Ирсэн', detail.stats.arrived, RESULT_COLOR.arrived], ['Ирээгүй', detail.stats.missing, RESULT_COLOR.missing], ['Илүү ирсэн', detail.stats.extra, RESULT_COLOR.extra]] as const).map(([l, n, c]) => (
          <div key={l} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 0.8rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: c, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{l}</div>
          </div>
        ))}
      </div>
      <div className="seg" role="tablist">
        {(['missing', 'extra', 'arrived'] as const).map(k => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {RESULT_LABEL[k]} ({detail.items.filter(i => i.result === k).length})
          </button>
        ))}
      </div>
      {shown.length === 0 ? <p className="empty" style={{ padding: '0.6rem 0' }}>{tab === 'missing' ? 'Ирээгүй ачаа алга ✓' : 'Алга'}</p> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>#</th><th>Трак код</th><th>Утас</th><th>Нэр</th><th>Ирсэн</th></tr></thead>
            <tbody>
              {shown.map((it, i) => (
                <tr key={it.trackCode}>
                  <td style={{ color: 'var(--muted)' }}>{i + 1}</td>
                  <td className="mono">{it.trackCode}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{it.phone ?? '—'}</td>
                  <td>{it.name ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{it.arrivedAt ? fmtDay(it.arrivedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

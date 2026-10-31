'use client'
// Тулгалтын түүх (туршилт): «Ирсэн» бүртгэлийн өмнө Эрээнээс сонгосон ачааг бүртгэлтэй тулгасан тайлангууд.
// Шинэ тулгалтыг «Ирсэн» хуудаснаас «Эрээнээс сонгох»-оор эхлүүлнэ.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import { PageHeader } from '@/app/components/ui'
import { confirmAsync } from '@/app/components/ConfirmDialog'
import DispatchReport, { type Detail, type Stats, RESULT_COLOR, fmtDay } from './DispatchReport'

type Row = { id: number; date: string; name: string | null; closedAt: string | null; createdByName: string; stats: Stats }

export default function DispatchHistoryPage() {
  const [list, setList] = useState<Row[] | null>(null)
  const [denied, setDenied] = useState(false)
  const [detail, setDetail] = useState<Detail | null>(null)

  async function load() {
    const r = await fetch('/api/admin/dispatch').catch(() => null)
    if (r?.status === 403) { setDenied(true); return }
    if (r?.ok) setList(await r.json())
  }
  async function open(id: number) {
    const r = await fetch(`/api/admin/dispatch/${id}`).catch(() => null)
    if (r?.ok) setDetail(await r.json())
  }
  async function remove(id: number) {
    if (!await confirmAsync('Энэ тайланг устгах уу? Ачаанд хүрэхгүй.')) return
    await fetch(`/api/admin/dispatch/${id}`, { method: 'DELETE' })
    if (detail?.id === id) setDetail(null)
    load()
  }
  useEffect(() => { load() }, [])

  if (denied) return <div className="page-wide"><PageHeader title="Тулгалт" /><p className="empty">Тулгалт энэ каргод идэвхжээгүй байна.</p></div>

  return (
    <div className="page-wide">
      <PageHeader title="Тулгалтын түүх" sub="«Ирсэн» бүртгэлийн өмнө Эрээнээс сонгосон ачаа ирсэн эсэхийн тайлангууд. Шинэ тулгалтыг «Ирсэн» хуудаснаас эхлүүлнэ." />
      <div className="card" style={{ padding: '0.3rem 0', marginBottom: '1rem' }}>
        {list === null ? <p className="empty" style={{ padding: '1rem' }}>…</p> : list.length === 0 ? (
          <p className="empty" style={{ padding: '1rem' }}>Тайлан алга. <Link href="/admin/arrived" style={{ color: 'var(--accent)' }}>«Ирсэн»</Link> хуудсанд «Эрээнээс сонгох» дарж эхлүүлнэ.</p>
        ) : list.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', borderBottom: '1px solid var(--border)', background: detail?.id === d.id ? 'var(--surface2)' : 'none' }}>
            <button onClick={() => open(d.id)} style={{ flex: 1, textAlign: 'left', border: 0, background: 'none', padding: '0.7rem 1rem', cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'grid', gap: '0.2rem', minWidth: 0 }}>
              <span><b>{fmtDay(d.date)}</b> · {d.name}{d.closedAt ? '' : <span style={{ color: 'var(--accent)' }}> · дуусаагүй</span>}</span>
              <span style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: 'var(--muted)' }}>{d.stats.loaded} сонгосон</span>
                <span style={{ color: RESULT_COLOR.arrived, fontWeight: 700 }}>✓ {d.stats.arrived}</span>
                {d.stats.missing > 0 && <span style={{ color: RESULT_COLOR.missing, fontWeight: 700 }}>✕ {d.stats.missing} ирээгүй</span>}
                {d.stats.extra > 0 && <span style={{ color: RESULT_COLOR.extra, fontWeight: 700 }}>+ {d.stats.extra} илүү</span>}
                <span style={{ color: 'var(--muted)' }}>· {d.createdByName}</span>
              </span>
            </button>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Тайлан устгах" onClick={() => remove(d.id)} style={{ marginRight: '0.6rem' }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      {detail && <div className="card" style={{ padding: '1rem 1.1rem' }}><DispatchReport key={detail.id} detail={detail} /></div>}
    </div>
  )
}

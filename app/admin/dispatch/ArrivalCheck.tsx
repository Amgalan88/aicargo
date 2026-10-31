'use client'
// «Ирсэн» хуудасны тулгалт (эзэмшигч тохиргооноос асаана): бүртгэлийн өмнө «Эрээнд ирсэн» ачаанаас хүлээгдэж буйг сонгоно →
// бүртгэл урьдын адил → «Дуусгах» дарахад тайлан тэр дор нь. Карго асаагаагүй бол юу ч харагдахгүй.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { confirmAsync } from '@/app/components/ConfirmDialog'
import { toast } from 'sonner'
import DispatchReport, { type Detail, type Stats, RESULT_COLOR, ubDate } from './DispatchReport'

type Open = { id: number; name: string | null; stats: Stats }
type EreenRow = { id: number; trackCode: string; phone: string | null; name: string | null; ereenArrivedAt: string | null }

function Picker({ onClose, onPicked }: { onClose: () => void; onPicked: (id: number) => void }) {
  const [rows, setRows] = useState<EreenRow[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { fetch('/api/admin/dispatch/ereen').then(r => r.json()).then(setRows).catch(() => setRows([])) }, [])

  // Эрээнд ирсэн өдрөөр, өдөр дотроо оруулсан удаагаар (нэг Excel/жагсаалт = нэг цаг; уншуулсан нь
  // 10 минутаас бага зайтай бол нэг удаа) бүлэглэнэ — зарим карго өдөрт 2–3 удаа оруулдаг
  const days = useMemo(() => {
    const m = new Map<string, EreenRow[]>()
    for (const r of rows ?? []) {
      const k = r.ereenArrivedAt ? ubDate(new Date(r.ereenArrivedAt).getTime()) : 'Огноогүй'
      m.set(k, [...(m.get(k) ?? []), r])
    }
    return [...m.entries()].map(([day, items]) => {
      const batches: { time: string; items: EreenRow[] }[] = []
      let last = Infinity
      for (const r of items) { // API аль хэдийн шинэ нь эхэнд эрэмбэлсэн
        const t = r.ereenArrivedAt ? new Date(r.ereenArrivedAt).getTime() : 0
        if (!batches.length || last - t > 10 * 60_000) {
          batches.push({ time: r.ereenArrivedAt ? new Date(t + 8 * 3600_000).toISOString().slice(11, 16) : '', items: [] })
        }
        batches[batches.length - 1].items.push(r)
        last = t
      }
      return { day, items, batches }
    })
  }, [rows])

  function toggleDay(items: EreenRow[]) {
    const all = items.every(i => picked.has(i.id))
    setPicked(prev => { const n = new Set(prev); for (const i of items) { if (all) n.delete(i.id); else n.add(i.id) } return n })
  }
  function toggle(id: number) { setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }

  async function create() {
    setSaving(true)
    const r = await fetch('/api/admin/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shipmentIds: [...picked] }) }).catch(() => null)
    setSaving(false)
    const d = await r?.json().catch(() => ({}))
    if (!r?.ok) { toast.error(d?.error || 'Алдаа гарлаа'); return }
    onPicked(d.id)
  }

  return (
    <div className="ins-bg" onClick={onClose}>
      <div className="ins" role="dialog" aria-modal="true" aria-label="Эрээнээс сонгох" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="ins-head">
          <b>Эрээнээс сонгох</b>
          <button type="button" className="ins-x" aria-label="Хаах" onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 0.6rem' }}>Энэ удаа ирэх ёстой ачааг сонгоно — өдрөөр, тухайн өдрийн аль удаагийн оруулгаар, эсвэл нэг бүрчлэн.</p>
        <div style={{ overflowY: 'auto', flex: 1, display: 'grid', gap: '0.4rem', alignContent: 'start' }}>
          {rows === null ? <p className="empty">…</p> : days.length === 0 ? <p className="empty">«Эрээнд ирсэн» ачаа алга.</p> : days.map(({ day, items, batches }) => {
            const n = items.filter(i => picked.has(i.id)).length
            const dayLabel = day === 'Огноогүй' ? day : day.slice(5).replace('-', '/')
            return (
              <div key={day} style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem' }}>
                  <input type="checkbox" aria-label={`${dayLabel} бүгдийг сонгох`} checked={n === items.length} ref={el => { if (el) el.indeterminate = n > 0 && n < items.length }}
                    onChange={() => toggleDay(items)} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
                  <span style={{ flex: 1 }}>
                    <b>{dayLabel}</b> · {items.length} ачаа{batches.length > 1 ? <span style={{ color: 'var(--muted)' }}> · {batches.length} удаа</span> : ''}{n ? <span style={{ color: 'var(--accent)' }}> · {n} сонгосон</span> : ''}
                  </span>
                </div>
                {batches.map((bt, bi) => {
                  const key = `${day}#${bi}`
                  const bn = bt.items.filter(i => picked.has(i.id)).length
                  return (
                    <div key={key} style={{ borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.75rem 0.45rem 1.6rem' }}>
                        {batches.length > 1 && (
                          <input type="checkbox" aria-label={`${dayLabel} ${bt.time} сонгох`} checked={bn === bt.items.length} ref={el => { if (el) el.indeterminate = bn > 0 && bn < bt.items.length }}
                            onChange={() => toggleDay(bt.items)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                        )}
                        <button type="button" onClick={() => setOpenKey(openKey === key ? null : key)} style={{ flex: 1, textAlign: 'left', border: 0, background: 'none', font: 'inherit', fontSize: '0.86rem', color: 'inherit', cursor: 'pointer', padding: 0 }}>
                          {batches.length > 1 ? <><b>{bt.time || '—'}</b>-д оруулсан · {bt.items.length} ачаа</> : <span style={{ color: 'var(--muted)' }}>{bt.time ? `${bt.time}-д оруулсан · ` : ''}ачаануудыг харах</span>}
                          {bn && batches.length > 1 ? <span style={{ color: 'var(--accent)' }}> · {bn} сонгосон</span> : ''} <span style={{ color: 'var(--muted)' }}>{openKey === key ? '▴' : '▾'}</span>
                        </button>
                      </div>
                      {openKey === key && (
                        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                          {bt.items.map(i => (
                            <label key={i.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.3rem 0.75rem 0.3rem 2.6rem', fontSize: '0.84rem', cursor: 'pointer' }}>
                              <input type="checkbox" checked={picked.has(i.id)} onChange={() => toggle(i.id)} style={{ accentColor: 'var(--accent)' }} />
                              <span className="mono" style={{ flex: 1 }}>{i.trackCode}</span>
                              <span style={{ color: 'var(--muted)' }}>{i.phone ?? ''}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
        <button className="btn" style={{ marginTop: '0.8rem', width: '100%' }} disabled={!picked.size || saving} onClick={create}>
          {saving ? 'Хадгалж байна…' : `Сонгох (${picked.size})`}
        </button>
      </div>
    </div>
  )
}

export default function ArrivalCheck({ refreshKey, onActive }: { refreshKey: number; onActive: (id: number | null) => void }) {
  const [enabled, setEnabled] = useState(false)
  const [active, setActive] = useState<Open | null>(null)
  const [picking, setPicking] = useState(false)
  const [report, setReport] = useState<Detail | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/dispatch?open=1').catch(() => null)
    if (!r?.ok) { setEnabled(false); return }
    setEnabled(true)
    const list: Open[] = await r.json()
    // Дуусаагүй тулгалтыг (хуудас дахин ачаалсан ч) үргэлжлүүлнэ
    setActive(list[0] ?? null)
  }, [])
  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => { onActive(active?.id ?? null) }, [active?.id, onActive])

  async function finish() {
    if (!active) return
    if (active.stats.missing && !await confirmAsync(`${active.stats.missing} ачаа хараахан бүртгэгдээгүй байна. Дуусгаж тайлан гаргах уу?`)) return
    await fetch(`/api/admin/dispatch/${active.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ closed: true }) })
    const r = await fetch(`/api/admin/dispatch/${active.id}`)
    if (r.ok) setReport(await r.json())
    setActive(null)
  }
  async function cancel() {
    if (!active || !await confirmAsync('Сонголтыг цуцлах уу? Бүртгэсэн ачаанд хүрэхгүй.')) return
    await fetch(`/api/admin/dispatch/${active.id}`, { method: 'DELETE' })
    setActive(null)
  }

  if (!enabled) return null
  const s = active?.stats

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem', padding: '0.65rem 0.85rem', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius)', background: active ? 'var(--accent-light)' : 'var(--surface)' }}>
        {active && s ? (
          <>
            <span style={{ fontSize: '0.86rem' }}>🚚 <b>Сонгосон {s.loaded} ачаа</b> <span style={{ color: 'var(--muted)' }}>({active.name})</span></span>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: RESULT_COLOR.arrived }}>✓ {s.arrived} ирсэн</span>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: s.missing ? RESULT_COLOR.missing : 'var(--muted)' }}>{s.missing} үлдсэн</span>
            {s.extra > 0 && <span style={{ fontSize: '0.84rem', fontWeight: 700, color: RESULT_COLOR.extra }}>+{s.extra} илүү</span>}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
              <button className="btn btn-sm" onClick={finish}>Дуусгах · тайлан</button>
              <button className="btn btn-ghost btn-sm" onClick={cancel}>Цуцлах</button>
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '0.86rem', color: 'var(--muted)' }}>🚚 Ирэх ёстой ачааг сонговол бүртгэлийн төгсгөлд ирсэн / ирээгүй / илүү тайлан гарна.</span>
            <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { setReport(null); setPicking(true) }}>Эрээнээс сонгох</button>
          </>
        )}
      </div>

      {report && (
        <div className="card" style={{ padding: '1rem 3rem 1rem 1.1rem', marginBottom: '1rem', position: 'relative' }}>
          <button type="button" className="ins-x" aria-label="Тайлан хаах" onClick={() => setReport(null)} style={{ position: 'absolute', top: 10, right: 10 }}><X size={16} /></button>
          <DispatchReport detail={report} />
        </div>
      )}

      {picking && <Picker onClose={() => setPicking(false)} onPicked={() => { setPicking(false); load() }} />}
    </>
  )
}

'use client'
// Ачилт (туршилт): Эрээнээс ачигдсан бөөн кодыг ачилт болгож, «Ирсэн» бүртгэлтэй тулгана —
// ирсэн / ирээгүй / ачилтад байгаагүй атлаа ирсэн (илүү). Ирээгүйг тэр дор нь, зөвхөн админд харуулна.
import { useEffect, useMemo, useState } from 'react'
import { Truck, Download, Lock, LockOpen, Trash2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { PageHeader } from '@/app/components/ui'
import { confirmAsync } from '@/app/components/ConfirmDialog'
import { parseTrackCode } from '@/lib/track-code'

type Stats = { loaded: number; arrived: number; missing: number; extra: number }
type Dispatch = { id: number; date: string; name: string | null; closedAt: string | null; createdByName: string; stats: Stats }
type Item = { trackCode: string; phone: string | null; name: string | null; arrivedAt: string | null; price: number | null; result: 'arrived' | 'missing' | 'extra'; status: string | null }
type Detail = Omit<Dispatch, 'stats'> & { stats: Stats; items: Item[] }

const ubDate = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10)
const todayUB = () => ubDate(Date.now())
const fmtDay = (iso: string) => ubDate(new Date(iso).getTime()).slice(5).replace('-', '/')
const RESULT_LABEL = { arrived: 'Ирсэн', missing: 'Ирээгүй', extra: 'Илүү' } as const
const RESULT_COLOR = { arrived: 'var(--green)', missing: 'var(--danger)', extra: 'var(--orange, #c98a12)' } as const

// Агуулахын жагсаалт: «帅帅，11月1号» толгой + «1. JT…» дугаарласан мөрүүд
function parseList(text: string) {
  const dateLine = /(\d{1,2})\s*月\s*(\d{1,2})\s*[号號日]/
  const lines = text.split(/\r?\n/).map(l => l.replace(/^\s*\d+[.、)]\s*/, '').trim()).filter(Boolean)
  const codes: string[] = []
  const skipped: string[] = []
  for (const l of lines) {
    const c = parseTrackCode(l)
    if (c) { if (!codes.includes(c)) codes.push(c) } else if (!dateLine.test(l)) skipped.push(l)
  }
  let date = ''
  const m = text.match(dateLine)
  if (m) {
    const t = todayUB()
    date = `${t.slice(0, 4)}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
    if (date > t) date = `${Number(t.slice(0, 4)) - 1}${date.slice(4)}`
  }
  return { codes, skipped, date }
}

function Chips({ s }: { s: Stats }) {
  return (
    <span style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ color: 'var(--muted)' }}>{s.loaded} код</span>
      <span style={{ color: RESULT_COLOR.arrived, fontWeight: 700 }}>✓ {s.arrived}</span>
      {s.missing > 0 && <span style={{ color: RESULT_COLOR.missing, fontWeight: 700 }}>✕ {s.missing} ирээгүй</span>}
      {s.extra > 0 && <span style={{ color: RESULT_COLOR.extra, fontWeight: 700 }}>+ {s.extra} илүү</span>}
    </span>
  )
}

export default function DispatchPage() {
  const [list, setList] = useState<Dispatch[] | null>(null)
  const [denied, setDenied] = useState(false)
  const [text, setText] = useState('')
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [tab, setTab] = useState<'missing' | 'extra' | 'arrived'>('missing')

  const parsed = useMemo(() => parseList(text), [text])

  async function load() {
    const r = await fetch('/api/admin/dispatch').catch(() => null)
    if (r?.status === 403) { setDenied(true); return }
    if (r?.ok) setList(await r.json())
  }
  async function open(id: number) {
    const r = await fetch(`/api/admin/dispatch/${id}`).catch(() => null)
    if (r?.ok) { setDetail(await r.json()); setTab('missing') }
  }
  useEffect(() => { load() }, [])
  // Толгойн «11月1号»-оос огноо (админ өөрөө сонгоогүй бол)
  useEffect(() => { if (parsed.date && !date) setDate(parsed.date) }, [parsed.date, date])

  async function create() {
    if (!parsed.codes.length) return
    setSaving(true)
    const r = await fetch('/api/admin/dispatch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: date || todayUB(), name, codes: parsed.codes }),
    }).catch(() => null)
    setSaving(false)
    const d = await r?.json().catch(() => ({}))
    if (!r?.ok) { toast.error(d?.error || 'Алдаа гарлаа'); return }
    toast.success(`Ачилт үүслээ — ${d.count} код`)
    setText(''); setDate(''); setName('')
    await load()
    open(d.id)
  }

  async function setClosed(closed: boolean) {
    if (!detail) return
    await fetch(`/api/admin/dispatch/${detail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ closed }) })
    await load(); open(detail.id)
  }
  async function remove() {
    if (!detail || !await confirmAsync('Энэ ачилтыг устгах уу? Ачаанд хүрэхгүй, зөвхөн ачилтын жагсаалт устна.')) return
    await fetch(`/api/admin/dispatch/${detail.id}`, { method: 'DELETE' })
    setDetail(null); load()
  }
  function exportExcel() {
    if (!detail) return
    const rows = detail.items.map((it, i) => ({
      '№': i + 1, 'Трак код': it.trackCode, 'Үр дүн': RESULT_LABEL[it.result],
      'Утас': it.phone ?? '', 'Нэр': it.name ?? '', 'Ирсэн огноо': it.arrivedAt ? ubDate(new Date(it.arrivedAt).getTime()) : '', 'Үнэ': it.price ?? '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Тулгалт')
    XLSX.writeFile(wb, `achilt-${ubDate(new Date(detail.date).getTime())}-${detail.id}.xlsx`)
  }

  if (denied) return <div className="page-wide"><PageHeader title="Ачилт" /><p className="empty">Ачилт энэ каргод идэвхжээгүй байна.</p></div>

  const shown = detail?.items.filter(i => i.result === tab) ?? []

  return (
    <div className="page-wide">
      <PageHeader title="Ачилт" sub="Эрээнээс ачигдсан бөөн кодыг оруулж, «Ирсэн» бүртгэлтэй тулгана — ирээгүй, илүү ачааг тэр дор нь харна." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', alignItems: 'start' }}>
        {/* Шинэ ачилт */}
        <div className="card" style={{ padding: '1rem 1.1rem', display: 'grid', gap: '0.7rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Шинэ ачилт</h3>
          <textarea id="dispatch-list" className="input" rows={8} placeholder={'Агуулахын жагсаалтаа буулгана уу, жш:\n帅帅，11月1号\n1. 79043465220886\n2. JT5540545815331'}
            value={text} onChange={e => setText(e.target.value)} style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
          {text.trim() && (
            <p style={{ fontSize: '0.8rem', margin: 0, color: parsed.skipped.length ? 'var(--danger)' : 'var(--muted)', overflowWrap: 'anywhere' }}>
              {parsed.codes.length} трак код{parsed.skipped.length ? ` · ⚠ ${parsed.skipped.length} мөр код биш: ${parsed.skipped.slice(0, 5).join(', ')}${parsed.skipped.length > 5 ? '…' : ''} — засаж дахин буулгана уу` : ''}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: '0.78rem', color: 'var(--muted)' }}>Ачигдсан огноо
              <input id="dispatch-date" type="date" className="input" value={date || todayUB()} max={todayUB()} onChange={e => setDate(e.target.value)} style={{ width: 'auto' }} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: '0.78rem', color: 'var(--muted)', flex: 1, minWidth: 140 }}>Нэр (заавал биш)
              <input id="dispatch-name" className="input" placeholder="жш: 1-р машин" value={name} onChange={e => setName(e.target.value)} />
            </label>
          </div>
          <button className="btn" onClick={create} disabled={saving || !parsed.codes.length}>
            <Truck size={16} /> {saving ? 'Хадгалж байна…' : `Ачилт үүсгэх (${parsed.codes.length})`}
          </button>
        </div>

        {/* Ачилтууд */}
        <div className="card" style={{ padding: '0.4rem 0', display: 'grid' }}>
          {list === null ? <p className="empty" style={{ padding: '1rem' }}>…</p> : list.length === 0 ? (
            <p className="empty" style={{ padding: '1rem' }}>Ачилт алга. Агуулахын жагсаалтаа зүүн талд буулгаж эхний ачилтаа үүсгэнэ үү.</p>
          ) : list.map(d => {
            const pct = d.stats.loaded ? Math.round(d.stats.arrived / d.stats.loaded * 100) : 0
            return (
              <button key={d.id} onClick={() => open(d.id)} style={{
                textAlign: 'left', border: 0, borderBottom: '1px solid var(--border)', background: detail?.id === d.id ? 'var(--surface2)' : 'none',
                padding: '0.7rem 1rem', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', display: 'grid', gap: '0.3rem',
              }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <b>{fmtDay(d.date)}{d.name ? ` · ${d.name}` : ''}</b>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{d.closedAt ? 'Хаалттай' : 'Нээлттэй'}</span>
                </span>
                <Chips s={d.stats} />
                <span style={{ height: 5, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: RESULT_COLOR.arrived }} />
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Тулгалтын дэлгэрэнгүй */}
      {detail && (
        <div className="card" style={{ marginTop: '1.25rem', padding: '1rem 1.1rem', display: 'grid', gap: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Ачилт · {fmtDay(detail.date)}{detail.name ? ` · ${detail.name}` : ''}</h3>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={exportExcel}><Download size={14} /> Excel</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setClosed(!detail.closedAt)}>
                {detail.closedAt ? <><LockOpen size={14} /> Дахин нээх</> : <><Lock size={14} /> Хаах</>}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={remove} aria-label="Ачилт устгах"><Trash2 size={14} /></button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.6rem' }}>
            {([['Ачигдсан', detail.stats.loaded, 'var(--text)'], ['Ирсэн', detail.stats.arrived, RESULT_COLOR.arrived], ['Ирээгүй', detail.stats.missing, RESULT_COLOR.missing], ['Илүү ирсэн', detail.stats.extra, RESULT_COLOR.extra]] as const).map(([l, n, c]) => (
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
                      <td>{it.name ?? (it.status ? '—' : <span style={{ color: 'var(--muted)' }}>системд бүртгэлгүй</span>)}</td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{it.arrivedAt ? fmtDay(it.arrivedAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

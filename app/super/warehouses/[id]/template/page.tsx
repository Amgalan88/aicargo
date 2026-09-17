'use client'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ContractDocument } from '@/app/components/ContractDocument'
import type { Clause, ContractBody, ClauseKind } from '@/lib/contract'
import { extractPlaceholders, validateTemplate, renderBody, formatDateTime } from '@/lib/contract'

interface TemplateData {
  saved: boolean
  version: number
  savedAt: string | null
  savedBy: string | null
  body: ContractBody
  placeholders: Record<string, string>
  cargoFields: string[]
  readiness: string[]
  acceptingContracts: boolean
}

type Row = Clause & { key: number }

let seq = 0
const withKeys = (clauses: Clause[]): Row[] => clauses.map(c => ({ ...c, key: ++seq }))

export default function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const api = `/api/super/warehouses/${id}/template`
  const [meta, setMeta] = useState<TemplateData | null>(null)
  const [titleMn, setTitleMn] = useState('')
  const [titleCn, setTitleCn] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(api)
    if (!res.ok) { toast.error('Ачаалахад алдаа гарлаа'); return }
    const d: TemplateData = await res.json()
    setMeta(d)
    setTitleMn(d.body.titleMn)
    setTitleCn(d.body.titleCn)
    setRows(withKeys(d.body.clauses))
    setDirty(false)
  }, [api])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const body: ContractBody = useMemo(() => ({
    titleMn, titleCn,
    clauses: rows.map(({ key: _k, ...c }) => c),
  }), [titleMn, titleCn, rows])
  const error = validateTemplate(body)

  function update(key: number, patch: Partial<Clause>) {
    setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r))
    setDirty(true)
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    setRows(rs => { const n = [...rs]; [n[i], n[j]] = [n[j], n[i]]; return n })
    setDirty(true)
  }
  function insert(i: number, kind: ClauseKind) {
    setRows(rs => { const n = [...rs]; n.splice(i + 1, 0, { key: ++seq, kind, no: kind === 'clause' ? '' : undefined, mn: '', cn: '' }); return n })
    setDirty(true)
  }
  function remove(i: number) {
    if (!confirm('Энэ мөрийг устгах уу?')) return
    setRows(rs => rs.filter((_, idx) => idx !== i))
    setDirty(true)
  }

  async function save() {
    if (error) { toast.error(error); return }
    setSaving(true)
    const res = await fetch(api, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast.error(d.error || 'Хадгалж чадсангүй'); return }
    toast.success(d.unchanged ? 'Өөрчлөлт байхгүй' : `Хувилбар ${d.version} хадгалагдлаа`)
    load()
  }

  if (!meta) return <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>

  // Урьдчилан харахад талбарыг [Нэр] хэлбэрээр харуулна
  const sampleVars = Object.fromEntries(Object.entries(meta.placeholders).map(([k, label]) => [k, `[${label}]`]))

  return (
    <div>
      <style>{CSS}</style>
      {meta.readiness.length > 0 || !meta.acceptingContracts ? (
        <div className="card tp-alert">
          <b>Каргонууд одоогоор энэ агуулахтай гэрээ байгуулах боломжгүй.</b>
          {meta.readiness.length > 0 && <div>Дутуу: {meta.readiness.join(', ')}</div>}
          {!meta.acceptingContracts && <div>"Шинэ гэрээ хүлээн авч байна" тохиргоо унтраалттай.</div>}
        </div>
      ) : (
        <div className="card tp-alert tp-ok">Бүх тохиргоо бэлэн — каргонууд гэрээ байгуулах боломжтой.</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', margin: '0 0 0.9rem' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          {meta.saved
            ? <>Хувилбар <b style={{ color: 'var(--text)' }}>{meta.version}</b> · {meta.savedBy} · {meta.savedAt && formatDateTime(meta.savedAt)}</>
            : <b style={{ color: '#d97706' }}>Хадгалаагүй — анхдагч загвар ачааллаа. Хянаж үзээд хадгална уу.</b>}
          {dirty && <span style={{ color: '#d97706', marginLeft: 8 }}>· Хадгалаагүй өөрчлөлттэй</span>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-ghost" onClick={() => setPreview(p => !p)}>{preview ? 'Засах' : 'Урьдчилан харах'}</button>
          <button className="btn" onClick={save} disabled={saving || !!error || (!dirty && meta.saved)}>
            {saving ? 'Хадгалж байна...' : 'Шинэ хувилбар хадгалах'}
          </button>
        </div>
      </div>
      {error && <p className="msg-error" style={{ marginBottom: '0.8rem' }}>{error}</p>}
      <p style={{ fontSize: '0.76rem', color: 'var(--muted)', margin: '0 0 1rem', lineHeight: 1.55 }}>
        Хадгалах бүрт шинэ хувилбар үүснэ. Өмнө баталгаажсан гэрээнүүд өөрийн хувилбараа хэвээр хадгална;
        ноорог гэрээнүүд шинэ хувилбараар гарын үсэг зурна.
      </p>

      {preview ? (
        <ContractDocument body={renderBody(body, sampleVars)} contractNo="AC0000-00000" />
      ) : (
        <div className="tp-layout">
          <div>
            <div className="card tp-row">
              <div className="tp-lbl">Гарчиг</div>
              <input className="input" value={titleMn} onChange={e => { setTitleMn(e.target.value); setDirty(true) }} placeholder="Монгол гарчиг" />
              <input className="input tp-cn" value={titleCn} onChange={e => { setTitleCn(e.target.value); setDirty(true) }} placeholder="中文标题" />
            </div>
            {rows.map((r, i) => {
              const a = extractPlaceholders(r.mn).map(k => k.replace(/(Mn|Cn)$/, ''))
              const b = extractPlaceholders(r.cn).map(k => k.replace(/(Mn|Cn)$/, ''))
              const mismatch = [...new Set(a)].sort().join() !== [...new Set(b)].sort().join()
              const unknown = [...extractPlaceholders(r.mn), ...extractPlaceholders(r.cn)].filter(k => !(k in meta.placeholders))
              return (
                <div key={r.key} className={`card tp-row tp-${r.kind}${mismatch || unknown.length || !r.mn.trim() || !r.cn.trim() ? ' tp-bad' : ''}`}>
                  <div className="tp-head">
                    <select className="input" value={r.kind} onChange={e => update(r.key, { kind: e.target.value as ClauseKind, no: e.target.value === 'clause' ? r.no ?? '' : undefined })}>
                      <option value="heading">Бүлгийн гарчиг</option>
                      <option value="clause">Заалт</option>
                      <option value="text">Текст</option>
                    </select>
                    {r.kind === 'clause' && (
                      <input className="input" style={{ width: 70 }} placeholder="2.1" value={r.no ?? ''} onChange={e => update(r.key, { no: e.target.value })} />
                    )}
                    <div className="tp-actions">
                      <button onClick={() => move(i, -1)} disabled={i === 0} title="Дээш">↑</button>
                      <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="Доош">↓</button>
                      <button onClick={() => insert(i, 'clause')} title="Доор нь заалт нэмэх">+ заалт</button>
                      <button onClick={() => insert(i, 'heading')} title="Доор нь гарчиг нэмэх">+ гарчиг</button>
                      <button onClick={() => remove(i)} title="Устгах" style={{ color: 'var(--danger)' }}>✕</button>
                    </div>
                  </div>
                  <textarea className="input" rows={r.kind === 'heading' ? 1 : Math.min(8, Math.ceil(r.mn.length / 90) + 1)} value={r.mn}
                    placeholder="Монгол текст" onChange={e => update(r.key, { mn: e.target.value })} />
                  <textarea className="input tp-cn" rows={r.kind === 'heading' ? 1 : Math.min(6, Math.ceil(r.cn.length / 45) + 1)} value={r.cn}
                    placeholder="中文翻译" onChange={e => update(r.key, { cn: e.target.value })} />
                  {(mismatch || unknown.length > 0) && (
                    <div className="tp-err">
                      {unknown.length > 0 && <>Байхгүй талбар: {unknown.map(k => `{{${k}}}`).join(', ')}. </>}
                      {mismatch && <>Монгол, хятад мөрийн талбарууд таарахгүй.</>}
                    </div>
                  )}
                </div>
              )
            })}
            <button className="btn-ghost" onClick={() => insert(rows.length - 1, 'clause')}>+ Төгсгөлд заалт нэмэх</button>
          </div>

          <aside className="card tp-ph">
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>Бөглөгдөх талбарууд</div>
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '0 0 0.6rem' }}>Дарж хуулаад текстэд буулгана. Монгол, хятад мөрөнд ижил талбар байх ёстой.</p>
            {Object.entries(meta.placeholders).map(([k, label]) => (
              <button key={k} className="tp-chip" onClick={() => navigator.clipboard.writeText(`{{${k}}}`).then(() => toast.success(`{{${k}}} хуулагдлаа`))}>
                <code>{`{{${k}}}`}</code>
                <span>{label}{meta.cargoFields.includes(k) ? ' · карго бөглөнө' : ''}</span>
              </button>
            ))}
          </aside>
        </div>
      )}
    </div>
  )
}

const CSS = `
.tp-alert { padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.83rem; border-color: #d97706; display: flex; flex-direction: column; gap: 0.2rem; }
.tp-ok { border-color: var(--green); color: var(--green); font-weight: 600; }
.tp-layout { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 1rem; align-items: start; }
.tp-row { padding: 0.7rem 0.8rem; margin-bottom: 0.6rem; display: flex; flex-direction: column; gap: 0.35rem; }
.tp-row textarea, .tp-row input { font-size: 0.84rem; }
.tp-heading { background: var(--surface2); }
.tp-heading textarea { font-weight: 700; }
.tp-bad { border-color: var(--danger); }
.tp-lbl { font-size: 0.74rem; font-weight: 700; color: var(--muted); }
.tp-cn { background: color-mix(in srgb, var(--accent) 5%, var(--surface)); }
.tp-head { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
.tp-head select { width: auto; font-size: 0.78rem; padding: 0.25rem 0.4rem; }
.tp-actions { margin-left: auto; display: flex; gap: 0.25rem; }
.tp-actions button { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 0.2rem 0.45rem; font-size: 0.72rem; cursor: pointer; color: var(--text); font-family: inherit; }
.tp-actions button:disabled { opacity: 0.35; cursor: default; }
.tp-err { font-size: 0.74rem; color: var(--danger); }
.tp-ph { position: sticky; top: 0.75rem; padding: 0.8rem; max-height: calc(100vh - 2rem); overflow-y: auto; }
.tp-chip { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%; text-align: left; background: none; border: none;
  border-bottom: 1px solid var(--border); padding: 0.35rem 0.1rem; cursor: pointer; font-family: inherit; color: var(--text); }
.tp-chip code { font-size: 0.72rem; color: var(--accent); }
.tp-chip span { font-size: 0.7rem; color: var(--muted); }
@media (max-width: 800px) { .tp-layout { grid-template-columns: minmax(0, 1fr); } .tp-ph { position: static; max-height: none; } }
`

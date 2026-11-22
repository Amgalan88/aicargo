'use client'
// Промо код (агент) + шатлалтай хөнгөлөлт — Cargo.promoEnabled асаалттай каргод. Өөрчлөхийг зөвхөн эзэмшигч админ.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import * as XLSX from 'xlsx'

type Tab = 'codes' | 'members' | 'tiers' | 'report'
interface Tier { name: string; pct: number }
interface Code {
  id: number; code: string; agentName: string; agentPhone: string | null; commissionPct: number
  tierName: string | null; tierPct: number | null; token: string; active: boolean; members: number
}
interface Base { canEdit: boolean; tiers: Tier[]; codes: Code[] }
interface MemberRow {
  phone: string; name: string | null; registered: boolean
  code: { id: number; code: string; source: string; at: string; by: string | null } | null
  tier: { name: string; pct: number; until: string | null; note: string | null; by: string | null; active: boolean } | null
}
interface ReportLine { phone: string; name: string | null; joinedAt: string; receipts: number; paidMnt: number }
interface ReportCode { id: number; code: string; agentName: string; commissionPct: number; active: boolean; members: number; newMembers: number; receipts: number; paidMnt: number; commissionMnt: number; lines: ReportLine[] }

const tg = (n: number) => '₮' + Math.round(n).toLocaleString('en-US')
const ymd = (iso: string | null) => { if (!iso) return '—'; const d = new Date(new Date(iso).getTime() + 8 * 3600_000); return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}` }
const thisMonth = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7)
const copy = (text: string, label: string) => navigator.clipboard.writeText(text).then(() => toast.success(`${label} хуулагдлаа`)).catch(() => toast.error('Хуулж чадсангүй'))

async function send(url: string, method: string, body: unknown): Promise<boolean> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) { toast.error(d.error || 'Алдаа гарлаа'); return false }
  return true
}

export default function PromoPage() {
  const [tab, setTab] = useState<Tab>('codes')
  const [base, setBase] = useState<Base | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const res = await fetch('/api/admin/promo')
    const d = await res.json().catch(() => ({}))
    if (res.ok) setBase(d); else setErr(d.error || 'Ачаалж чадсангүй')
  }, [])
  useEffect(() => { load() }, [load])

  if (!base) return <p className="empty">{err || 'Ачаалж байна…'}</p>
  return (
    <div className="page-wide pr-page">
      <h1 className="section-title" style={{ marginBottom: '0.4rem' }}>Промо код</h1>
      <p className="pr-sub">Агент бүрт код өгч, тэр кодоор бүртгүүлсэн хэрэглэгчдийн төлсөн дүнгээр шимтгэл бодно. Хэрэглэгчид хөнгөлөлтийн шат оноож болно.</p>
      {!base.canEdit && <p className="pr-note">Та зөвхөн харах эрхтэй — өөрчлөхийг эзэмшигч админ хийнэ.</p>}
      <div className="pr-tabs">
        {([['codes', 'Кодууд'], ['members', 'Хэрэглэгчид'], ['tiers', 'Шатууд'], ['report', 'Сарын тайлан']] as const).map(([k, l]) => (
          <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'codes' && <CodesTab base={base} reload={load} />}
      {tab === 'members' && <MembersTab base={base} />}
      {tab === 'tiers' && <TiersTab base={base} reload={load} />}
      {tab === 'report' && <ReportTab />}
    </div>
  )
}

// ── Кодууд ───────────────────────────────────────────────────────────────────

const EMPTY = { code: '', agentName: '', agentPhone: '', commissionPct: '', tierName: '' }

function CodesTab({ base, reload }: { base: Base; reload: () => void }) {
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof EMPTY, v: string) => setForm(f => ({ ...f, [k]: v }))
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const ok = editId
      ? await send('/api/admin/promo', 'PATCH', { id: editId, agentName: form.agentName, agentPhone: form.agentPhone, commissionPct: form.commissionPct, tierName: form.tierName })
      : await send('/api/admin/promo', 'POST', form)
    setBusy(false)
    if (!ok) return
    toast.success(editId ? 'Хадгаллаа' : 'Код үүслээ')
    setForm(EMPTY); setEditId(null); reload()
  }
  async function toggle(c: Code) {
    if (await send('/api/admin/promo', 'PATCH', { id: c.id, active: !c.active })) { toast.success(c.active ? 'Идэвхгүй болголоо' : 'Идэвхжүүллээ'); reload() }
  }

  return (
    <>
      {base.canEdit && (
        <form className="card pr-form" onSubmit={save}>
          <h2>{editId ? `${form.code} засах` : 'Шинэ код'}</h2>
          <div className="pr-grid">
            <label>Код<input className="input" placeholder="BOLD10" value={form.code} disabled={!!editId} maxLength={20}
              onChange={e => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} /></label>
            <label>Агентын нэр<input className="input" placeholder="Болд" value={form.agentName} onChange={e => set('agentName', e.target.value)} /></label>
            <label>Агентын утас<input className="input" inputMode="numeric" placeholder="заавал биш" value={form.agentPhone} onChange={e => set('agentPhone', e.target.value.replace(/\D/g, '').slice(0, 8))} /></label>
            <label>Шимтгэл %<input className="input" inputMode="decimal" placeholder="10" value={form.commissionPct} onChange={e => set('commissionPct', e.target.value.replace(/[^\d.,]/g, ''))} /></label>
            <label>Кодоор ирэхэд шат
              <select className="input" value={form.tierName} onChange={e => set('tierName', e.target.value)}>
                <option value="">Шатгүй</option>
                {base.tiers.map(t => <option key={t.name} value={t.name}>{t.name} · {t.pct}%</option>)}
              </select>
            </label>
          </div>
          <p className="pr-hint">Шимтгэл = кодоор бүртгүүлсэн хэрэглэгчдийн ачаа авахдаа бодитоор төлсөн (хөнгөлөлтийн дараах) дүнгийн хувь.</p>
          <div className="pr-actions">
            <button className="btn" disabled={busy}>{editId ? 'Хадгалах' : 'Код үүсгэх'}</button>
            {editId && <button type="button" className="pr-link" onClick={() => { setEditId(null); setForm(EMPTY) }}>Болих</button>}
          </div>
        </form>
      )}

      {base.codes.length === 0 ? <p className="empty">Одоогоор код алга.</p> : (
        <div className="pr-list">
          {base.codes.map(c => (
            <div key={c.id} className={`card pr-code${c.active ? '' : ' off'}`}>
              <div className="pr-code-top">
                <b className="pr-mono">{c.code}</b>
                <span>{c.agentName}{c.agentPhone ? ` · ${c.agentPhone}` : ''}</span>
                {!c.active && <span className="pr-badge">идэвхгүй</span>}
              </div>
              <div className="pr-code-meta">
                Шимтгэл <b>{c.commissionPct}%</b> · {c.tierName ? <>шат <b>{c.tierName} {c.tierPct}%</b></> : 'шатгүй'} · <b>{c.members}</b> хэрэглэгч
              </div>
              <div className="pr-code-links">
                <button type="button" className="pr-link" onClick={() => copy(`${origin}/register?ref=${c.code}`, 'Бүртгүүлэх линк')}><Copy size={13} /> Бүртгүүлэх линк</button>
                <button type="button" className="pr-link" onClick={() => copy(`${origin}/promo/${c.token}`, 'Агентын тайлангийн линк')}><Copy size={13} /> Агентын тайлан</button>
                {base.canEdit && <>
                  <button type="button" className="pr-link" onClick={() => {
                    setEditId(c.id)
                    setForm({ code: c.code, agentName: c.agentName, agentPhone: c.agentPhone ?? '', commissionPct: String(c.commissionPct), tierName: c.tierName ?? '' })
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}>Засах</button>
                  <button type="button" className="pr-link" onClick={() => toggle(c)}>{c.active ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'}</button>
                </>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Хэрэглэгчид ──────────────────────────────────────────────────────────────

function MembersTab({ base }: { base: Base }) {
  const [q, setQ] = useState('')
  const [codeId, setCodeId] = useState('')
  const [rows, setRows] = useState<MemberRow[] | null>(null)
  const [edit, setEdit] = useState<MemberRow | null>(null)
  const load = useCallback(async () => {
    const sp = new URLSearchParams()
    if (q.trim()) sp.set('q', q.trim())
    if (codeId) sp.set('codeId', codeId)
    const res = await fetch(`/api/admin/promo/members?${sp}`)
    if (res.ok) setRows((await res.json()).rows)
  }, [q, codeId])
  useEffect(() => { load() }, [codeId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <form className="pr-bar" onSubmit={e => { e.preventDefault(); load() }}>
        <input className="input" inputMode="numeric" placeholder="Утасны дугаар (8 оронтой бол шинээр оноож болно)" value={q} onChange={e => setQ(e.target.value.replace(/\D/g, '').slice(0, 8))} />
        <select className="input" value={codeId} onChange={e => setCodeId(e.target.value)}>
          <option value="">Бүх код</option>
          {base.codes.map(c => <option key={c.id} value={c.id}>{c.code} · {c.agentName}</option>)}
        </select>
        <button className="btn">Хайх</button>
      </form>
      {!rows ? <p className="empty">Ачаалж байна…</p> : rows.length === 0 ? <p className="empty">Кодтой эсвэл шаттай хэрэглэгч алга. 8 оронтой утсаар хайж оноож болно.</p> : (
        <div className="card pr-table">
          {rows.map(r => (
            <div key={r.phone} className="pr-row">
              <div className="pr-row-main">
                <b>{r.phone}</b> <span className="pr-muted">{r.name ?? (r.registered ? '' : 'бүртгэлгүй')}</span>
              </div>
              <div className="pr-row-tags">
                {r.code ? <span className="pr-tag">{r.code.code}</span> : <span className="pr-muted">кодгүй</span>}
                {r.tier ? <span className={`pr-tag tier${r.tier.active ? '' : ' off'}`}>{r.tier.name} {r.tier.pct}%{r.tier.until ? ` · ${ymd(r.tier.until)} хүртэл` : ''}{r.tier.active ? '' : ' (дууссан)'}</span> : <span className="pr-muted">шатгүй</span>}
              </div>
              {base.canEdit && <button type="button" className="pr-link" onClick={() => setEdit(r)}>Оноох</button>}
            </div>
          ))}
        </div>
      )}
      {edit && <AssignDialog row={edit} base={base} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </>
  )
}

function AssignDialog({ row, base, onClose, onSaved }: { row: MemberRow; base: Base; onClose: () => void; onSaved: () => void }) {
  const [codeId, setCodeId] = useState(row.code ? String(row.code.id) : '')
  const [tier, setTier] = useState(row.tier?.name ?? '')
  const [until, setUntil] = useState(row.tier?.until ? new Date(new Date(row.tier.until).getTime() + 8 * 3600_000).toISOString().slice(0, 10) : '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    const body: Record<string, unknown> = { phone: row.phone }
    if (codeId !== (row.code ? String(row.code.id) : '')) body.codeId = codeId ? Number(codeId) : null
    const tierChanged = tier !== (row.tier?.name ?? '') || (tier && until !== (row.tier?.until ? new Date(new Date(row.tier.until).getTime() + 8 * 3600_000).toISOString().slice(0, 10) : ''))
    if (tierChanged) Object.assign(body, { tier: tier || null, until: until || undefined, note })
    if (Object.keys(body).length === 1) { onClose(); return }
    setBusy(true)
    const ok = await send('/api/admin/promo/members', 'POST', body)
    setBusy(false)
    if (ok) { toast.success('Хадгаллаа'); onSaved() }
  }
  return (
    <div className="pr-modal" role="dialog" aria-modal="true" aria-label={`${row.phone} оноох`} onClick={onClose}>
      <div className="card pr-dialog" onClick={e => e.stopPropagation()}>
        <h2>{row.phone}{row.name ? ` · ${row.name}` : ''}</h2>
        <label>Промо код
          <select className="input" value={codeId} onChange={e => setCodeId(e.target.value)}>
            <option value="">Кодгүй</option>
            {base.codes.map(c => <option key={c.id} value={c.id}>{c.code} · {c.agentName}{c.active ? '' : ' (идэвхгүй)'}</option>)}
          </select>
        </label>
        {codeId && codeId !== (row.code ? String(row.code.id) : '') && <p className="pr-hint">Шимтгэл шинэ кодод өнөөдрөөс тоологдоно.</p>}
        <label>Хөнгөлөлтийн шат
          <select className="input" value={tier} onChange={e => setTier(e.target.value)}>
            <option value="">Шатгүй</option>
            {base.tiers.map(t => <option key={t.name} value={t.name}>{t.name} · {t.pct}%</option>)}
          </select>
        </label>
        {tier && <>
          <label>Дуусах огноо <span className="pr-muted">(хоосон бол хугацаагүй)</span>
            <input className="input" type="date" value={until} onChange={e => setUntil(e.target.value)} />
          </label>
          <label>Тайлбар <span className="pr-muted">(заавал биш)</span>
            <input className="input" maxLength={200} value={note} onChange={e => setNote(e.target.value)} />
          </label>
        </>}
        <p className="pr-hint">Хөнгөлөлт ачаа олгоход каргын төлбөрөөс автоматаар хасагдана.</p>
        <div className="pr-actions">
          <button type="button" className="btn" disabled={busy} onClick={save}>Хадгалах</button>
          <button type="button" className="pr-link" onClick={onClose}>Болих</button>
        </div>
      </div>
    </div>
  )
}

// ── Шатууд ───────────────────────────────────────────────────────────────────

function TiersTab({ base, reload }: { base: Base; reload: () => void }) {
  const [tiers, setTiers] = useState<{ name: string; pct: string }[]>(base.tiers.map(t => ({ name: t.name, pct: String(t.pct) })))
  const [busy, setBusy] = useState(false)
  const upd = (i: number, k: 'name' | 'pct', v: string) => setTiers(ts => ts.map((t, j) => (j === i ? { ...t, [k]: v } : t)))
  async function save() {
    setBusy(true)
    const ok = await send('/api/admin/promo', 'PUT', { tiers: tiers.map(t => ({ name: t.name, pct: Number(t.pct) })) })
    setBusy(false)
    if (ok) { toast.success('Шат хадгаллаа'); reload() }
  }
  return (
    <div className="card pr-form">
      <h2>Хөнгөлөлтийн шатууд</h2>
      <p className="pr-hint">Хэрэглэгчид оноосон шатын хувь ачаа олгоход каргын төлбөрөөс хасагдана (50% хүртэл). Шат засахад өмнө оноосон хүмүүсийн хувь өөрчлөгдөхгүй — дахин оноовол шинэ хувь үйлчилнэ.</p>
      {tiers.map((t, i) => (
        <div key={i} className="pr-tier">
          <input className="input" placeholder="Нэр" maxLength={20} value={t.name} disabled={!base.canEdit} onChange={e => upd(i, 'name', e.target.value)} />
          <input className="input" inputMode="numeric" placeholder="%" value={t.pct} disabled={!base.canEdit} onChange={e => upd(i, 'pct', e.target.value.replace(/\D/g, '').slice(0, 2))} />
          <span className="pr-muted">%</span>
          {base.canEdit && tiers.length > 1 && <button type="button" className="pr-link danger" onClick={() => setTiers(ts => ts.filter((_, j) => j !== i))}>Хасах</button>}
        </div>
      ))}
      {base.canEdit && (
        <div className="pr-actions">
          {tiers.length < 10 && <button type="button" className="pr-link" onClick={() => setTiers(ts => [...ts, { name: '', pct: '' }])}>+ Шат нэмэх</button>}
          <button type="button" className="btn" disabled={busy} onClick={save}>Хадгалах</button>
        </div>
      )}
    </div>
  )
}

// ── Сарын тайлан ─────────────────────────────────────────────────────────────

function ReportTab() {
  const [month, setMonth] = useState(thisMonth())
  const [codes, setCodes] = useState<ReportCode[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    setCodes(null)
    fetch(`/api/admin/promo/report?month=${month}`).then(r => r.json()).then(d => setCodes(d.codes ?? [])).catch(() => setCodes([]))
  }, [month])

  function exportXlsx() {
    if (!codes) return
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(codes.map(c => ({
      'Код': c.code, 'Агент': c.agentName, 'Шимтгэл %': c.commissionPct, 'Хэрэглэгч': c.members, 'Энэ сард шинэ': c.newMembers,
      'Олголт': c.receipts, 'Төлсөн дүн ₮': Math.round(c.paidMnt), 'Шимтгэл ₮': c.commissionMnt,
    }))), 'Нийт')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(codes.flatMap(c => c.lines.map(l => ({
      'Код': c.code, 'Утас': l.phone, 'Нэр': l.name ?? '', 'Нэгдсэн': ymd(l.joinedAt), 'Олголт': l.receipts, 'Төлсөн дүн ₮': Math.round(l.paidMnt),
      'Шимтгэл ₮': Math.round((l.paidMnt * c.commissionPct) / 100),
    })))), 'Хэрэглэгчээр')
    XLSX.writeFile(wb, `promo-${month}.xlsx`)
  }

  const total = (codes ?? []).reduce((s, c) => s + c.commissionMnt, 0)
  return (
    <>
      <div className="pr-bar">
        <input className="input" type="month" value={month} max={thisMonth()} onChange={e => e.target.value && setMonth(e.target.value)} />
        <span className="pr-muted">Нийт шимтгэл <b style={{ color: 'var(--text)' }}>{tg(total)}</b></span>
        <button type="button" className="btn" disabled={!codes?.length} onClick={exportXlsx}>Excel татах</button>
      </div>
      {!codes ? <p className="empty">Ачаалж байна…</p> : codes.length === 0 ? <p className="empty">Код алга.</p> : (
        <div className="pr-list">
          {codes.map(c => (
            <div key={c.id} className="card pr-code">
              <button type="button" className="pr-rep" aria-expanded={open === c.id} onClick={() => setOpen(o => (o === c.id ? null : c.id))}>
                <span><b className="pr-mono">{c.code}</b> {c.agentName}</span>
                <span className="pr-muted">{c.members} хэрэглэгч (+{c.newMembers}) · {c.receipts} олголт · {tg(c.paidMnt)} × {c.commissionPct}%</span>
                <b className="pr-commission">{tg(c.commissionMnt)}</b>
              </button>
              {open === c.id && (
                c.lines.length === 0 ? <p className="pr-muted" style={{ margin: '0.5rem 0 0' }}>Хэрэглэгч алга.</p> : (
                  <div className="pr-lines">
                    {c.lines.map(l => (
                      <div key={l.phone} className="pr-line">
                        <span>{l.phone} <span className="pr-muted">{l.name ?? ''}</span></span>
                        <span className="pr-muted">{ymd(l.joinedAt)}-нд нэгдсэн · {l.receipts} олголт</span>
                        <b>{tg(l.paidMnt)}</b>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

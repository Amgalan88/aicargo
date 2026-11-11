'use client'
import { useCallback, useEffect, useState } from 'react'
import type { LoyaltyConfig, VipTier } from '@/lib/loyalty-core'

// Урамшуулал: Тохиргоо (горим асаах, хувь) · Хэрэглэгчид (VIP жагсаалт, гараар оноох) · Сарын тайлан
type Tab = 'settings' | 'customers' | 'report'
const tg = (n: number) => '₮' + Math.round(n).toLocaleString('en-US')
const dt = (iso: string | null) => { if (!iso) return '—'; const d = new Date(iso); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}` }
const thisMonth = () => { const d = new Date(Date.now() + 8 * 3600_000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }

export default function LoyaltyPage() {
  const [tab, setTab] = useState<Tab>('settings')
  return (
    <div className="page-wide">
      <h1 className="section-title" style={{ marginBottom: '1rem' }}>Урамшуулал</h1>
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {([['settings', 'Тохиргоо'], ['customers', 'VIP / оноо'], ['report', 'Сарын тайлан']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '0.35rem 1rem', borderRadius: '100px', fontSize: '0.82rem', fontFamily: 'inherit', cursor: 'pointer',
            border: `1px solid ${tab === k ? 'var(--accent)' : 'var(--border)'}`,
            background: tab === k ? 'var(--accent)' : 'var(--surface)', color: tab === k ? 'var(--on-accent)' : 'var(--muted)', fontWeight: tab === k ? 700 : 400,
          }}>{l}</button>
        ))}
      </div>
      {tab === 'settings' && <SettingsTab />}
      {tab === 'customers' && <CustomersTab />}
      {tab === 'report' && <ReportTab />}
    </div>
  )
}

type Cfg = LoyaltyConfig & { canEdit: boolean }

function Num({ label, value, onChange, disabled, suffix }: { label: string; value: number; onChange: (v: number) => void; disabled: boolean; suffix?: string }) {
  return (
    <div className="form-group">
      <label>{label}{suffix ? ` (${suffix})` : ''}</label>
      <input className="input" type="number" min={0} step={1} value={Number.isFinite(value) ? value : ''} disabled={disabled}
        onChange={e => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
    </div>
  )
}

function Switch({ on, disabled, onClick, label, desc }: { on: boolean; disabled: boolean; onClick: () => void; label: string; desc: string }) {
  return (
    <div className="st-toggle">
      <p><b>{label}</b> — {desc}</p>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' on' : ''}`} disabled={disabled} onClick={onClick}><span /></button>
    </div>
  )
}

function SettingsTab() {
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { fetch('/api/admin/loyalty/settings').then(r => r.json()).then(setCfg).catch(() => setMsg({ ok: false, text: 'Ачаалж чадсангүй' })) }, [])
  if (!cfg) return <p className="empty">{msg?.text ?? 'Ачаалж байна…'}</p>
  const ro = !cfg.canEdit || busy
  const set = <K extends keyof LoyaltyConfig>(k: K, v: LoyaltyConfig[K]) => setCfg({ ...cfg, [k]: v })
  const setTier = (i: number, patch: Partial<VipTier>) => set('vipTiers', cfg.vipTiers.map((t, j) => (j === i ? { ...t, ...patch } : t)))

  async function save() {
    if (!cfg) return
    setBusy(true); setMsg(null)
    const { canEdit: _c, ...body } = cfg
    void _c
    const r = await fetch('/api/admin/loyalty/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (r.ok) { setCfg(d); setMsg({ ok: true, text: 'Хадгаллаа' }) } else setMsg({ ok: false, text: d.error || 'Алдаа гарлаа' })
  }

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ padding: '1rem 1.2rem' }}>
        <Switch on={cfg.pointsEnabled} disabled={ro} onClick={() => set('pointsEnabled', !cfg.pointsEnabled)}
          label="Карго оноо" desc="олгох бүрт оноо хуримтлагдаж, дараагийн олголтод төлбөрөөс хасагдана. Бэлнээр гарахгүй." />
        <Switch on={cfg.vipEnabled} disabled={ro} onClick={() => set('vipEnabled', !cfg.vipEnabled)}
          label="VIP хөнгөлөлт" desc="сүүлийн хугацааны олгосон дүнгээр 1–5% автоматаар, эсвэл гараар оноосон хувь (аль өндөр нь)." />
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.5rem' }}>Хоёуланг нь унтраавал «Олгох» урьдын адил ажиллана. Асаасан ч хуримтлагдсан оноо устахгүй.</p>
        {!cfg.canEdit && <p className="st-locked">Зөвхөн каргогийн эзэмшигч өөрчилнө.</p>}
      </div>

      <div className="card" style={{ padding: '1rem 1.2rem' }}>
        <h2 style={{ fontSize: '0.95rem', margin: '0 0 0.6rem' }}>Оноо</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.6rem' }}>
          <Num label="1 оноо авах төлбөр" suffix="₮" value={cfg.earnMntPerPoint} onChange={v => set('earnMntPerPoint', v)} disabled={ro} />
          <Num label="1 онооны үнэ" suffix="₮" value={cfg.pointValueMnt} onChange={v => set('pointValueMnt', v)} disabled={ro} />
          <Num label="Хугацаа" suffix="хоног" value={cfg.pointsExpiryDays} onChange={v => set('pointsExpiryDays', v)} disabled={ro} />
          <Num label="Нэг олголтын дээд" suffix="%" value={cfg.maxRedeemPct} onChange={v => set('maxRedeemPct', v)} disabled={ro} />
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
          Жишээ: {tg(10000)} төлөхөд {Math.floor(10000 / (cfg.earnMntPerPoint || 1))} оноо = {tg(Math.floor(10000 / (cfg.earnMntPerPoint || 1)) * (cfg.pointValueMnt || 0))} буцаана
          (≈{(((cfg.pointValueMnt || 0) / (cfg.earnMntPerPoint || 1)) * 100).toFixed(1)}%). Оноо ашиглахад хэрэглэгч бүртгэлтэй, утсаа баталгаажуулсан байна.
        </p>
      </div>

      <div className="card" style={{ padding: '1rem 1.2rem' }}>
        <h2 style={{ fontSize: '0.95rem', margin: '0 0 0.6rem' }}>VIP шат</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.6rem' }}>
          <Num label="Тооцох хугацаа" suffix="хоног" value={cfg.vipWindowDays} onChange={v => set('vipWindowDays', v)} disabled={ro} />
          <Num label="Шат буурахад хадгалах" suffix="хоног" value={cfg.vipGraceDays} onChange={v => set('vipGraceDays', v)} disabled={ro} />
        </div>
        {cfg.vipTiers.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginTop: '0.4rem' }}>
            <div className="form-group" style={{ flex: 2, margin: 0 }}>
              <label>Олгосон дүн ≥ (₮)</label>
              <input className="input" type="number" min={1} value={t.minSpend} disabled={ro} onChange={e => setTier(i, { minSpend: Number(e.target.value) })} />
            </div>
            <div className="form-group" style={{ flex: 1, margin: 0 }}>
              <label>Хөнгөлөлт</label>
              <select className="input" value={t.pct} disabled={ro} onChange={e => setTier(i, { pct: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5].map(p => <option key={p} value={p}>{p}%</option>)}
              </select>
            </div>
            <button type="button" className="btn" disabled={ro || cfg.vipTiers.length <= 1} onClick={() => set('vipTiers', cfg.vipTiers.filter((_, j) => j !== i))}
              style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>✕</button>
          </div>
        ))}
        {cfg.vipTiers.length < 5 && (
          <button type="button" disabled={ro} onClick={() => {
            const last = cfg.vipTiers[cfg.vipTiers.length - 1]
            set('vipTiers', [...cfg.vipTiers, { minSpend: (last?.minSpend ?? 0) + 100000, pct: Math.min(5, (last?.pct ?? 0) + 1) }])
          }} style={{ marginTop: '0.5rem', background: 'none', border: '1px dashed var(--border)', borderRadius: 8, padding: '0.35rem 0.8rem', cursor: 'pointer', color: 'var(--muted)', fontFamily: 'inherit' }}>
            + Шат нэмэх
          </button>
        )}
      </div>

      {cfg.canEdit && <button className="btn" onClick={save} disabled={busy}>{busy ? '...' : 'Хадгалах'}</button>}
      {msg && <p className={msg.ok ? 'msg-success' : 'msg-error'}>{msg.text}</p>}
    </div>
  )
}

interface Row {
  phone: string; name: string | null; registered: boolean; verified: boolean; spend: number; autoPct: number; held: boolean
  manualPct: number | null; manualActivePct: number; manualNote: string | null; manualUntil: string | null; manualBy: string | null
  effectivePct: number; source: 'AUTO' | 'MANUAL' | null; pointsBalance: number
}

function CustomersTab() {
  const [q, setQ] = useState('')
  const [data, setData] = useState<{ rows: Row[]; total: number; canEdit: boolean; config: LoyaltyConfig } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const load = useCallback((query = '') => {
    fetch(`/api/admin/loyalty/customers?q=${encodeURIComponent(query)}`).then(r => r.json()).then(setData).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])
  return (
    <div>
      <form onSubmit={e => { e.preventDefault(); load(q) }} style={{ display: 'flex', gap: '0.5rem', maxWidth: 420, marginBottom: '1rem' }}>
        <input className="input" placeholder="Утасны дугаар (8 оронтой бол шинээр VIP оноож болно)" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn" type="submit">Хайх</button>
      </form>
      {!data ? <p className="empty">Ачаалж байна…</p> : data.rows.length === 0 ? <p className="empty">VIP эсвэл оноотой хэрэглэгч алга.</p> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                {['Утас', 'Нэр', `${data.config.vipWindowDays} хоног`, 'Авто', 'Гараар', 'Үйлчлэх', 'Оноо'].map(h => <th key={h} style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.rows.map(r => (
                <tr key={r.phone} onClick={() => setOpen(open === r.phone ? null : r.phone)} style={{ cursor: 'pointer', background: open === r.phone ? 'var(--surface2)' : undefined }}>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace' }}>{r.phone}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{r.name ?? <span style={{ color: 'var(--muted)' }}>бүртгэлгүй</span>}{r.registered && !r.verified ? ' ·⚠' : ''}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{tg(r.spend)}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{r.autoPct ? `${r.autoPct}%${r.held ? ' (хадгалж буй)' : ''}` : '—'}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{r.manualPct ? `${r.manualPct}%${r.manualUntil ? ` · ${dt(r.manualUntil)}` : ''}${r.manualActivePct ? '' : ' (дууссан)'}` : '—'}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 700, color: r.effectivePct ? 'var(--accent)' : 'var(--muted)' }}>{r.effectivePct ? `${r.effectivePct}%` : '—'}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{r.pointsBalance}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.total > data.rows.length && <p style={{ padding: '0.5rem 0.75rem', color: 'var(--muted)', fontSize: '0.78rem' }}>Эхний {data.rows.length} / {data.total}. Утсаар хайна уу.</p>}
        </div>
      )}
      {open && data && <CustomerDetail phone={open} canEdit={data.canEdit} onSaved={() => load(q)} />}
    </div>
  )
}

interface Detail {
  ledger: { id: number; kind: string; points: number; createdAt: string; expiresAt: string | null; receiptId: number | null; note: string | null; actorName: string | null }[]
  receipts: { id: number; createdAt: string; itemCount: number; grossMnt: string; vipPct: number; vipDiscountMnt: string; pointsRedeemed: number; pointsEarned: number; netMnt: string; createdByName: string; loyaltyNote: string | null; voidedAt: string | null; voidedByName: string | null }[]
  customer: { manual: { pct: number | null; note: string | null; until: string | null } }
}
const KIND: Record<string, string> = { EARN: 'Хуримтлуулсан', REDEEM: 'Ашигласан', ADJUST: 'Үнэ засварын залруулга', EXPIRE: 'Хугацаа дууссан', VOID: 'Олголт буцаасан' }

function CustomerDetail({ phone, canEdit, onSaved }: { phone: string; canEdit: boolean; onSaved: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [pct, setPct] = useState('0')
  const [note, setNote] = useState('')
  const [until, setUntil] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    fetch(`/api/admin/loyalty/customers?phone=${phone}`).then(r => r.json()).then((x: Detail) => {
      setD(x); setPct(String(x.customer.manual.pct ?? 0)); setNote(x.customer.manual.note ?? ''); setUntil(x.customer.manual.until ? new Date(new Date(x.customer.manual.until).getTime() + 8 * 3600_000).toISOString().slice(0, 10) : '')
    }).catch(() => {})
  }, [phone])
  async function save() {
    setMsg(null)
    const r = await fetch('/api/admin/loyalty/customers', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, pct: Number(pct) || null, note, until: Number(pct) ? until || null : null }),
    })
    const x = await r.json().catch(() => ({}))
    if (r.ok) { setMsg({ ok: true, text: 'Хадгаллаа' }); onSaved() } else setMsg({ ok: false, text: x.error || 'Алдаа' })
  }
  if (!d) return <p className="empty">Ачаалж байна…</p>
  return (
    <div className="card" style={{ marginTop: '1rem', padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <h2 style={{ fontSize: '0.95rem', margin: 0, fontFamily: 'monospace' }}>{phone}</h2>
      {canEdit ? (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Гараар VIP</label>
            <select className="input" value={pct} onChange={e => setPct(e.target.value)}>
              <option value="0">Байхгүй</option>
              {[1, 2, 3, 4, 5].map(p => <option key={p} value={p}>{p}%</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
            <label>Шалтгаан</label>
            <input className="input" value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder="жш: бөөний харилцагч" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Дуусах (заавал биш)</label>
            <input className="input" type="date" value={until} onChange={e => setUntil(e.target.value)} />
          </div>
          <button className="btn" onClick={save}>Хадгалах</button>
        </div>
      ) : <p className="st-locked">Гараар VIP оноохыг зөвхөн каргогийн эзэмшигч хийнэ.</p>}
      {msg && <p className={msg.ok ? 'msg-success' : 'msg-error'} style={{ margin: 0 }}>{msg.text}</p>}
      <div>
        <h3 style={{ fontSize: '0.85rem', margin: '0 0 0.4rem' }}>Олголтын баримт</h3>
        {d.receipts.length === 0 ? <p className="empty" style={{ padding: 0 }}>Алга</p> : d.receipts.map(r => (
          <div key={r.id} className="card-row" style={{ fontSize: '0.8rem', ...(r.voidedAt ? { opacity: 0.55, textDecoration: 'line-through' } : {}) }}>
            <span>{dt(r.createdAt)} · {r.itemCount} ачаа · {r.createdByName}{r.loyaltyNote === 'self' ? ' · өөрийн утас' : ''}{r.voidedAt ? ` · буцаасан ${dt(r.voidedAt)}${r.voidedByName ? ` (${r.voidedByName})` : ''}` : ''}</span>
            <span>{tg(Number(r.grossMnt))}{Number(r.vipDiscountMnt) ? ` −${r.vipPct}%` : ''}{r.pointsRedeemed ? ` −${r.pointsRedeemed}о` : ''} → <b>{tg(Number(r.netMnt))}</b>{r.pointsEarned ? ` · +${r.pointsEarned}о` : ''}</span>
          </div>
        ))}
      </div>
      <div>
        <h3 style={{ fontSize: '0.85rem', margin: '0 0 0.4rem' }}>Онооны түүх</h3>
        {d.ledger.length === 0 ? <p className="empty" style={{ padding: 0 }}>Алга</p> : d.ledger.map(e => (
          <div key={e.id} className="card-row" style={{ fontSize: '0.8rem' }}>
            <span>{dt(e.createdAt)} · {KIND[e.kind] ?? e.kind}{e.note ? ` · ${e.note}` : ''}{e.expiresAt ? ` · дуусах ${dt(e.expiresAt)}` : ''}</span>
            <b style={{ color: e.points > 0 ? 'var(--green)' : 'var(--danger)' }}>{e.points > 0 ? '+' : ''}{e.points}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

interface Report {
  month: string; enabled: { points: boolean; vip: boolean }
  receipts: { count: number; items: number; grossMnt: number; netMnt: number; vipReceipts: number; vipDiscountMnt: number; pointsRedeemed: number; pointsRedeemedMnt: number; pointsEarned: number }
  ledger: { earned: number; redeemed: number; expired: number; adjustedUp: number; adjustedDown: number; voidReversed: number; voidRefunded: number }
  voidedReceipts: { count: number; grossMnt: number; netMnt: number }
  priceEditsAfterHandover: { count: number; vipDiscountDeltaMnt: number; pointsDelta: number }
  manualVipChanges: number; outstandingPoints: number; outstandingMnt: number; vipTiersNow: Record<string, number>
}

function ReportTab() {
  const [month, setMonth] = useState(thisMonth())
  const [r, setR] = useState<Report | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    setR(null); setErr('')
    fetch(`/api/admin/loyalty/report?month=${month}`).then(async x => { const d = await x.json(); if (x.ok) setR(d); else setErr(d.error) }).catch(() => setErr('Алдаа'))
  }, [month])
  const Stat = ({ label, value }: { label: string; value: string }) => (
    <div className="card" style={{ padding: '0.75rem 1rem' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{value}</div>
    </div>
  )
  return (
    <div style={{ maxWidth: 820 }}>
      <input className="input" type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ maxWidth: 200, marginBottom: '1rem' }} />
      {err && <p className="msg-error">{err}</p>}
      {!r ? (!err && <p className="empty">Ачаалж байна…</p>) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
          <Stat label="Олголтын баримт" value={`${r.receipts.count} (${r.receipts.items} ачаа)`} />
          <Stat label="Нийт дүн" value={tg(r.receipts.grossMnt)} />
          <Stat label="Төлсөн дүн" value={tg(r.receipts.netMnt)} />
          <Stat label="VIP хөнгөлөлт" value={`${tg(r.receipts.vipDiscountMnt)} · ${r.receipts.vipReceipts} баримт`} />
          <Stat label="Оноогоор хассан" value={`${tg(r.receipts.pointsRedeemedMnt)} · ${r.receipts.pointsRedeemed} оноо`} />
          <Stat label="Хуримтлуулсан оноо" value={String(r.ledger.earned)} />
          <Stat label="Хугацаа дууссан оноо" value={String(r.ledger.expired)} />
          <Stat label="Үнэ засварын залруулга" value={`+${r.ledger.adjustedUp} / −${r.ledger.adjustedDown} оноо`} />
          <Stat label="Буцаасан олголт" value={`${r.voidedReceipts.count} баримт · ${tg(r.voidedReceipts.netMnt)} · −${r.ledger.voidReversed} / +${r.ledger.voidRefunded} оноо`} />
          <Stat label="Олгосны дараа үнэ зассан" value={`${r.priceEditsAfterHandover.count} удаа · VIP ${r.priceEditsAfterHandover.vipDiscountDeltaMnt >= 0 ? '+' : ''}${tg(r.priceEditsAfterHandover.vipDiscountDeltaMnt)}`} />
          <Stat label="Гараар VIP өөрчилсөн" value={String(r.manualVipChanges)} />
          <Stat label="Нийт үлдэгдэл оноо (өр)" value={`${r.outstandingPoints} = ${tg(r.outstandingMnt)}`} />
          <Stat label="Одоогийн VIP" value={Object.keys(r.vipTiersNow).length ? Object.entries(r.vipTiersNow).map(([p, n]) => `${p}%: ${n}`).join(' · ') : '—'} />
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LEDGER_KIND_LABEL, type LedgerKind } from '@/lib/loyalty'

type Tab = 'settings' | 'vip' | 'report'

interface Tier { minSpend: number; pct: number }
interface Settings {
  exists: boolean
  vipEnabled: boolean
  pointsEnabled: boolean
  vipTiers: Tier[]
  mntPerPoint: number
  pointValueMnt: number
  rules: { vipWindowDays: number; vipGraceDays: number; pointsExpiryDays: number; maxRedeemPct: number }
  canEdit: boolean
}
interface VipRow {
  phone: string
  name: string | null
  spend: number
  autoPct: number
  graceUntil: string | null
  manualPct: number | null
  manualUntil: string | null
  manualNote: string | null
  manualBy: string | null
  manualActive: boolean
  pct: number
  source: string | null
}
interface Report {
  receipts: { count: number; shipments: number; grossMnt: number; discountMnt: number; redeemedPoints: number; redeemedMnt: number; netMnt: number; earnedPoints: number }
  byVipPct: { pct: number; count: number; grossMnt: number; discountMnt: number }[]
  adjustments: { count: number; byReason: Record<string, number>; discountDelta: number; redeemedPointsDelta: number; earnedPointsDelta: number; netDelta: number }
  ledger: Record<string, { points: number; count: number }>
  outstanding: { points: number; valueMnt: number; holders: number }
  priceEditsAfterHandover: { trackCode: string; oldPrice: number | null; newPrice: number | null; actorName: string; createdAt: string; receiptId: number | null }[]
  manualVipChanges: { userName: string; detail: string; createdAt: string }[]
}

const mnt = (n: number) => '₮' + Math.round(n).toLocaleString('en-US')
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('sv-SE') : ''

function thisMonth() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
}

export default function LoyaltyPage() {
  const [tab, setTab] = useState<Tab>('settings')
  return (
    <div className="page-wide">
      <h1 className="section-title">Урамшуулал</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '-0.4rem', marginBottom: '1rem' }}>
        Хоёр горим тус тусдаа. Анхдагчаар хоёул унтраалттай — асаагаагүй каргоны олголт өмнөхөөрөө.
      </p>
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {([['settings', 'Тохиргоо'], ['vip', 'VIP хэрэглэгч'], ['report', 'Сарын тайлан']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '0.35rem 1rem', borderRadius: '100px', fontSize: '0.82rem', fontFamily: 'inherit', cursor: 'pointer',
            border: `1px solid ${tab === id ? 'var(--accent)' : 'var(--border)'}`,
            background: tab === id ? 'var(--accent)' : 'var(--surface)',
            color: tab === id ? 'var(--on-accent)' : 'var(--muted)',
            fontWeight: tab === id ? 700 : 400,
          }}>{label}</button>
        ))}
      </div>
      {tab === 'settings' && <SettingsTab />}
      {tab === 'vip' && <VipTab />}
      {tab === 'report' && <ReportTab />}
    </div>
  )
}

function SettingsTab() {
  const [s, setS] = useState<Settings | null>(null)
  const [tiers, setTiers] = useState<Tier[]>([])
  const [mntPerPoint, setMntPerPoint] = useState('1000')
  const [pointValue, setPointValue] = useState('20')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/admin/loyalty/settings').then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return
      setS(d)
      setTiers(d.vipTiers)
      setMntPerPoint(String(d.mntPerPoint))
      setPointValue(String(d.pointValueMnt))
    }).catch(() => {})
  }, [])

  async function save(patch: Record<string, unknown>) {
    if (!s?.canEdit) return
    setBusy(true)
    const res = await fetch('/api/admin/loyalty/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }).catch(() => null)
    setBusy(false)
    const data = await res?.json().catch(() => null)
    if (!res?.ok) { toast.error(data?.error || 'Хадгалахад алдаа гарлаа'); return }
    setS(data)
    // Асаах/унтраах нь шатны засварлаагүй мөрийг дарж болохгүй
    if (patch.vipTiers) setTiers(data.vipTiers)
    toast.success('Хадгалагдлаа')
  }

  if (!s) return <p className="empty">Ачаалж байна...</p>
  const lock = !s.canEdit
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 640 }}>
      {lock && <p className="msg-error" style={{ margin: 0 }}>Зөвхөн эзэмшигч асааж, хувь, босгыг өөрчилнө. Ажилтан харах боломжтой.</p>}
      <section className="card" style={{ padding: '1rem 1.2rem' }}>
        <Toggle label="VIP хөнгөлөлт" desc={`Сүүлийн ${s.rules.vipWindowDays} хоногийн олгосон дүнгээр ${s.rules.vipGraceDays} хоногийн grace-тэйгээр. Гараар оноосон хувь нь автоматаас давуу.`}
          on={s.vipEnabled} disabled={lock || busy} onChange={v => save({ vipEnabled: v })} />
        <div style={{ height: 1, background: 'var(--border)', margin: '0.8rem 0' }} />
        <Toggle label="Оноо" desc={`₮${s.mntPerPoint} = 1 оноо, 1 оноо = ₮${s.pointValueMnt}. ${s.rules.pointsExpiryDays} хоног. Нэг олголтын ${s.rules.maxRedeemPct}% хүртэл. Бэлнээр солигдохгүй.`}
          on={s.pointsEnabled} disabled={lock || busy} onChange={v => save({ pointsEnabled: v })} />
      </section>

      <section className="card" style={{ padding: '1rem 1.2rem' }}>
        <h2 style={{ fontSize: '0.95rem', margin: '0 0 0.6rem' }}>VIP шат (90 хоногийн олгосон дүн)</h2>
        {tiers.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.45rem', alignItems: 'center' }}>
            <input className="input" type="number" min={1} disabled={lock} value={t.minSpend}
              onChange={e => setTiers(tiers.map((x, j) => j === i ? { ...x, minSpend: Number(e.target.value) } : x))}
              style={{ maxWidth: 180 }} />
            <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>₮-өөс</span>
            <input className="input" type="number" min={1} max={5} disabled={lock} value={t.pct}
              onChange={e => setTiers(tiers.map((x, j) => j === i ? { ...x, pct: Number(e.target.value) } : x))}
              style={{ maxWidth: 80 }} />
            <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>%</span>
            {!lock && tiers.length > 1 && (
              <button type="button" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
            )}
          </div>
        ))}
        {!lock && tiers.length < 5 && (
          <button type="button" onClick={() => setTiers([...tiers, { minSpend: (tiers.at(-1)?.minSpend ?? 0) + 100000, pct: Math.min(5, (tiers.at(-1)?.pct ?? 0) + 1) }])}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', padding: 0 }}>
            + Шат нэмэх
          </button>
        )}
      </section>

      <section className="card" style={{ padding: '1rem 1.2rem' }}>
        <h2 style={{ fontSize: '0.95rem', margin: '0 0 0.6rem' }}>Онооны ханш</h2>
        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Хэдэн ₮ = 1 оноо
            <input className="input" type="number" min={1} disabled={lock} value={mntPerPoint} onChange={e => setMntPerPoint(e.target.value)} />
          </label>
          <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            1 оноо = хэдэн ₮
            <input className="input" type="number" min={1} disabled={lock} value={pointValue} onChange={e => setPointValue(e.target.value)} />
          </label>
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0.6rem 0 0' }}>
          Оноо зөвхөн бэлнээр төлсөн хэсэгт ногдоно. Буцаалт 10%-иас хэтрэхгүй. Зарцуулахад бүртгэлтэй, утсаа баталгаажуулсан хэрэглэгч байна.
        </p>
      </section>

      {!lock && (
        <button className="btn" disabled={busy} style={{ alignSelf: 'flex-start' }} onClick={() => save({
          vipTiers: tiers.map(t => ({ minSpend: Math.round(Number(t.minSpend)), pct: Math.round(Number(t.pct)) })),
          mntPerPoint: Math.round(Number(mntPerPoint)),
          pointValueMnt: Math.round(Number(pointValue)),
        })}>{busy ? '...' : 'Хадгалах'}</button>
      )}
    </div>
  )
}

function Toggle({ label, desc, on, disabled, onChange }: { label: string; desc: string; on: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
      <div>
        <strong style={{ fontSize: '0.92rem' }}>{label}</strong>
        <p style={{ margin: '0.2rem 0 0', color: 'var(--muted)', fontSize: '0.78rem' }}>{desc}</p>
      </div>
      <button type="button" disabled={disabled} onClick={() => onChange(!on)} style={{
        flexShrink: 0, borderRadius: 100, border: '1px solid var(--border)', padding: '0.35rem 0.8rem', cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit', fontWeight: 700, fontSize: '0.78rem',
        background: on ? 'var(--accent)' : 'var(--surface2)', color: on ? 'var(--on-accent)' : 'var(--muted)',
      }}>{on ? 'Асаалттай' : 'Унтраалттай'}</button>
    </div>
  )
}

function VipTab() {
  const [rows, setRows] = useState<VipRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [canEdit, setCanEdit] = useState(false)
  const [q, setQ] = useState('')
  const [pct, setPct] = useState('')
  const [phone, setPhone] = useState('')
  const [manualPct, setManualPct] = useState('5')
  const [note, setNote] = useState('')
  const [until, setUntil] = useState('')
  const [lookup, setLookup] = useState('')
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [busy, setBusy] = useState(false)

  function load(nextQ = q, nextPct = pct) {
    const p = new URLSearchParams()
    if (nextQ.trim()) p.set('q', nextQ.trim())
    if (nextPct) p.set('pct', nextPct)
    fetch(`/api/admin/loyalty/vip?${p}`).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return
      setRows(d.rows)
      setCounts(d.counts)
      setCanEdit(d.canEdit)
    }).catch(() => {})
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function assign(clear: boolean) {
    setBusy(true)
    const res = await fetch('/api/admin/loyalty/vip', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, pct: clear ? null : Number(manualPct), note, until: until || null }),
    }).catch(() => null)
    setBusy(false)
    const data = await res?.json().catch(() => null)
    if (!res?.ok) { toast.error(data?.error || 'Алдаа'); return }
    toast.success(clear ? 'Гараар оноосон VIP цуцлагдлаа' : 'VIP оноолоо')
    setNote('')
    load()
  }

  async function recalc() {
    setBusy(true)
    const res = await fetch('/api/admin/loyalty/vip', { method: 'PATCH' }).catch(() => null)
    setBusy(false)
    const data = await res?.json().catch(() => null)
    if (!res?.ok) { toast.error('Тооцоолоход алдаа гарлаа'); return }
    toast.success(`${data.checked} утас шалгаж, ${data.changed} өөрчлөгдлөө`)
    load()
  }

  async function findCustomer(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch(`/api/admin/loyalty/customer?phone=${encodeURIComponent(lookup)}`)
    const data = await res.json().catch(() => null)
    if (!res.ok) { toast.error(data?.error || 'Олдсонгүй'); setDetail(null); return }
    setDetail(data)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {Object.entries(counts).map(([p, n]) => (
          <span key={p} style={{ fontSize: '0.78rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '0.2rem 0.7rem' }}>
            {p}% · {n}
          </span>
        ))}
        <button className="btn" style={{ marginLeft: 'auto', fontSize: '0.8rem' }} disabled={busy} onClick={recalc}>Одоо дахин тооцох</button>
      </div>

      <form onSubmit={e => { e.preventDefault(); load() }} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input className="input" placeholder="Утас" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 180 }} />
        <select className="input" value={pct} onChange={e => setPct(e.target.value)} style={{ maxWidth: 140 }}>
          <option value="">Бүх хувь</option>
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}%</option>)}
        </select>
        <button className="btn" type="submit">Хайх</button>
      </form>

      <div className="card" style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              {['Утас', 'Нэр', '90 хоног', 'Авто', 'Гараар', 'Хүчинтэй', 'Эх үүсвэр'].map(h => (
                <th key={h} style={{ padding: '0.55rem 0.7rem', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} style={{ padding: '1rem', color: 'var(--muted)' }}>VIP хэрэглэгч алга</td></tr>}
            {rows.map(r => (
              <tr key={r.phone} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '0.5rem 0.7rem', fontFamily: 'monospace' }}>{r.phone}</td>
                <td style={{ padding: '0.5rem 0.7rem' }}>{r.name || '—'}</td>
                <td style={{ padding: '0.5rem 0.7rem' }}>{mnt(r.spend)}</td>
                <td style={{ padding: '0.5rem 0.7rem' }}>{r.autoPct > 0 ? `${r.autoPct}%` : '—'}{r.graceUntil ? ` · ${day(r.graceUntil)}` : ''}</td>
                <td style={{ padding: '0.5rem 0.7rem' }}>{r.manualPct ? `${r.manualPct}%${r.manualActive ? '' : ' (дууссан)'}` : '—'}</td>
                <td style={{ padding: '0.5rem 0.7rem', fontWeight: 700 }}>{r.pct > 0 ? `${r.pct}%` : '—'}</td>
                <td style={{ padding: '0.5rem 0.7rem' }}>{r.source === 'MANUAL' ? 'Гараар' : r.source === 'AUTO' ? 'Автомат' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <section className="card" style={{ padding: '1rem 1.2rem', maxWidth: 640 }}>
          <h2 style={{ fontSize: '0.95rem', margin: '0 0 0.6rem' }}>Гараар оноох</h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 0 }}>Өөрийн болон ажилтны утсанд оноохгүй. Шалтгаан заавал. Хоосон хувь нь цуцална.</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input className="input" placeholder="Утас" value={phone} onChange={e => setPhone(e.target.value)} style={{ maxWidth: 160 }} />
            <select className="input" value={manualPct} onChange={e => setManualPct(e.target.value)} style={{ maxWidth: 100 }}>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}%</option>)}
            </select>
            <input className="input" type="date" value={until} onChange={e => setUntil(e.target.value)} style={{ maxWidth: 170 }} />
            <input className="input" placeholder="Шалтгаан" value={note} onChange={e => setNote(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem' }}>
            <button className="btn" disabled={busy} onClick={() => assign(false)}>Оноох</button>
            <button className="btn" disabled={busy} onClick={() => assign(true)} style={{ background: 'var(--surface2)', color: 'var(--text)' }}>Цуцлах</button>
          </div>
        </section>
      )}

      <form onSubmit={findCustomer} style={{ display: 'flex', gap: '0.5rem', maxWidth: 420 }}>
        <input className="input" placeholder="Хэрэглэгч хайх — 8 оронтой утас" value={lookup} onChange={e => setLookup(e.target.value)} />
        <button className="btn" type="submit">Харах</button>
      </form>
      {detail && <CustomerCard detail={detail} />}
    </div>
  )
}

interface CustomerDetail {
  phone: string
  owner: { name: string; phoneVerifiedAt: string | null } | null
  vip: { pct: number; source: string | null; spend: number; autoPct: number }
  points: { balance: number; debt: number }
  ledger: { id: number; kind: LedgerKind; points: number; createdAt: string; expiresAt: string | null; note: string | null }[]
  receipts: { id: number; createdAt: string; current: { netMnt: number; discountMnt: number; redeemedPoints: number; earnedPoints: number } }[]
}

function CustomerCard({ detail }: { detail: CustomerDetail }) {
  return (
    <section className="card" style={{ padding: '1rem 1.2rem' }}>
      <strong>{detail.phone}</strong>
      <span style={{ color: 'var(--muted)', marginLeft: 8 }}>{detail.owner?.name || 'бүртгэлгүй'}{detail.owner?.phoneVerifiedAt ? '' : detail.owner ? ' · утас баталгаажаагүй' : ''}</span>
      <div style={{ display: 'flex', gap: '1.2rem', margin: '0.7rem 0', flexWrap: 'wrap', fontSize: '0.88rem' }}>
        <span>VIP <b>{detail.vip.pct > 0 ? `${detail.vip.pct}%` : '—'}</b> {detail.vip.source === 'MANUAL' ? '(гараар)' : detail.vip.source === 'AUTO' ? '(автомат)' : ''}</span>
        <span>90 хоног <b>{mnt(detail.vip.spend)}</b></span>
        <span>Оноо <b>{detail.points.balance}</b>{detail.points.debt > 0 ? ` · өр ${detail.points.debt}` : ''}</span>
      </div>
      {detail.ledger.length > 0 && (
        <div style={{ fontSize: '0.8rem' }}>
          {detail.ledger.slice(0, 15).map(l => (
            <div key={l.id} style={{ display: 'flex', gap: '0.8rem', padding: '0.25rem 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)', width: 92 }}>{day(l.createdAt)}</span>
              <span style={{ width: 120 }}>{LEDGER_KIND_LABEL[l.kind] ?? l.kind}</span>
              <b style={{ color: l.points < 0 ? 'var(--danger)' : 'var(--accent)', width: 50 }}>{l.points > 0 ? `+${l.points}` : l.points}</b>
              <span style={{ color: 'var(--muted)' }}>{l.note || ''}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ReportTab() {
  const [month, setMonth] = useState(thisMonth)
  const [data, setData] = useState<Report | null>(null)
  const [error, setError] = useState('')

  function load(m = month) {
    setError('')
    fetch(`/api/admin/loyalty/report?month=${m}`).then(async r => {
      const d = await r.json().catch(() => null)
      if (!r.ok) { setError(d?.error || 'Алдаа'); setData(null); return }
      setData(d)
    }).catch(() => setError('Алдаа'))
  }
  useEffect(() => { load(month) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const r = data?.receipts
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <form onSubmit={e => { e.preventDefault(); load() }} style={{ display: 'flex', gap: '0.5rem' }}>
        <input className="input" type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ maxWidth: 200 }} />
        <button className="btn" type="submit">Харах</button>
      </form>
      {error && <p className="msg-error">{error}</p>}
      {r && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem' }}>
            <Stat label="Олголт" value={String(r.count)} />
            <Stat label="Ачаа" value={String(r.shipments)} />
            <Stat label="Нийт дүн" value={mnt(r.grossMnt)} />
            <Stat label="VIP хөнгөлөлт" value={mnt(r.discountMnt)} />
            <Stat label="Оноогоор" value={`${r.redeemedPoints} · ${mnt(r.redeemedMnt)}`} />
            <Stat label="Олгосон оноо" value={String(r.earnedPoints)} />
            <Stat label="Төлсөн" value={mnt(r.netMnt)} />
            <Stat label="Олгоогүй үлдэгдэл" value={`${data!.outstanding.points} оноо · ${mnt(data!.outstanding.valueMnt)}`} hint={`${data!.outstanding.holders} хэрэглэгч`} />
          </div>
          {data!.byVipPct.length > 0 && (
            <section className="card" style={{ padding: '0.8rem 1rem', fontSize: '0.84rem' }}>
              {data!.byVipPct.map(g => (
                <div key={g.pct} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                  <span>{g.pct === 0 ? 'Хөнгөлөлтгүй' : `VIP ${g.pct}%`}</span>
                  <span>{g.count} олголт · {mnt(g.grossMnt)} · −{mnt(g.discountMnt)}</span>
                </div>
              ))}
            </section>
          )}
          <section className="card" style={{ padding: '0.8rem 1rem', fontSize: '0.84rem' }}>
            <strong>Залруулга</strong>
            <p style={{ margin: '0.3rem 0', color: 'var(--muted)' }}>
              {data!.adjustments.count} мөр
              {data!.adjustments.byReason.PRICE_EDIT ? ` · үнэ зассан ${data!.adjustments.byReason.PRICE_EDIT}` : ''}
              {data!.adjustments.byReason.PICKUP_REVERT ? ` · буцаасан ${data!.adjustments.byReason.PICKUP_REVERT}` : ''}
              {' · '}хөнгөлөлт {data!.adjustments.discountDelta >= 0 ? '+' : ''}{mnt(data!.adjustments.discountDelta)}
              {' · '}оноо {data!.adjustments.earnedPointsDelta >= 0 ? '+' : ''}{data!.adjustments.earnedPointsDelta}
            </p>
            {Object.entries(data!.ledger).map(([kind, v]) => (
              <div key={kind} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{LEDGER_KIND_LABEL[kind as LedgerKind] ?? kind}</span>
                <span>{v.count} · {v.points > 0 ? '+' : ''}{v.points}</span>
              </div>
            ))}
          </section>
          {data!.priceEditsAfterHandover.length > 0 && (
            <section className="card" style={{ padding: '0.8rem 1rem', fontSize: '0.82rem' }}>
              <strong>Олгосны дараа үнэ зассан</strong>
              {data!.priceEditsAfterHandover.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.7rem', padding: '0.3rem 0', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'monospace' }}>{p.trackCode}</span>
                  <span>{p.oldPrice == null ? '—' : mnt(p.oldPrice)} → {p.newPrice == null ? '—' : mnt(p.newPrice)}</span>
                  <span style={{ color: 'var(--muted)' }}>{p.actorName}</span>
                  {p.receiptId && <span style={{ color: 'var(--muted)' }}>#{p.receiptId}</span>}
                </div>
              ))}
            </section>
          )}
          {data!.manualVipChanges.length > 0 && (
            <section className="card" style={{ padding: '0.8rem 1rem', fontSize: '0.82rem' }}>
              <strong>Гараар VIP өөрчилсөн</strong>
              {data!.manualVipChanges.map((c, i) => (
                <div key={i} style={{ padding: '0.3rem 0', borderTop: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)' }}>{day(c.createdAt)} · {c.userName}</span> — {c.detail}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card" style={{ padding: '0.7rem 0.85rem' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontWeight: 700, marginTop: 2 }}>{value}</div>
      {hint && <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{hint}</div>}
    </div>
  )
}

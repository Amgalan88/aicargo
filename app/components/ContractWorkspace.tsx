'use client'
import { confirmAsync } from '@/app/components/ConfirmDialog'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Copy, Download, FileText, CheckCircle2, Clock, AlertTriangle, MapPin, Gift, MessagesSquare, Phone } from 'lucide-react'
import { ContractDocument, ContractTimeline, StatusBadge, ContractEventRow } from '@/app/components/ContractDocument'
import type { ContractBody, ReceiveAddress } from '@/lib/contract'
import { formatDateTime, TERMINATION_NOTICE_DAYS, PDF_STATUSES, ContractStatus, WEBSITE_BONUS_DAYS } from '@/lib/contract'
import { formatMnt } from '@/lib/warehouse'
import { resizeImage } from '@/lib/image-resize'

interface Detail {
  id: number
  contractNo: string
  status: ContractStatus
  values: Record<string, string>
  body: ContractBody
  fee: string
  payTo: { bank: string | null; account: string | null; holder: string | null }
  paymentProofUrl: string | null
  paymentNote: string | null
  paymentClaimedAt: string | null
  paidAt: string | null
  cargoSignedAt: string | null
  cargoSignerName: string | null
  approvedAt: string | null
  warehouseNote: string | null
  cargoMark: string | null
  receiveAddress: ReceiveAddress | null
  addressApplied: boolean
  rejectReason: string | null
  terminationRequestedBy: string | null
  terminationReason: string | null
  terminationEffectiveAt: string | null
  terminatedAt: string | null
  events: ContractEventRow[]
  warehouse: { id: number; name: string; slug: string | null; phone?: string | null; wechat?: string | null }
  canManage: boolean
  // Гэрээний нууц холбоосоор нээсэн (хүн бүрт ижил хуудас) эсвэл каргогийн админ хэсгээс зөвхөн харах
  viaLink: boolean
  // Каргод холбогдсон — вэбсайтын хаяг тохируулах боломжтой
  cargoLinked: boolean
  me: { name: string; email: string | null }
}

// Б талын гэрээний хуудас — гэрээний нууц холбоос (/contracts/g/[token]) нь бүх үйлдлийн нэг цэг;
// каргогийн ажилтан /admin/warehouse/[id]-ээр зөвхөн харна
interface Links {
  api: string
  pdfHref: string
  backHref: string
  backLabel: string
  newContractHref: (warehouse: { id: number; slug: string | null }) => string
  // Бүртгэлгүй хүний хүчинтэй гэрээнд: каргогоо нээж 60 хоног үнэгүй ашиглах санал
  signupHref?: string
  onLoaded?: (d: { contractNo: string; warehouse: { id: number; name: string } }) => void
  onMissing?: () => void
}

// Хүсэлтийн маягттай ижил 3 алхам
const STEPS = ['Хүсэлт', 'Төлбөр', 'Холбогдоно']

function stepOf(s: ContractStatus): number {
  if (s === 'AWAITING_PAYMENT' || s === 'PAYMENT_REVIEW') return 1
  return 2
}

export default function ContractWorkspace(links: Links) {
  const { api, backHref, backLabel, onLoaded, onMissing } = links
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(api)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Ачаалахад алдаа гарлаа')
      if (res.status === 404) onMissing?.()
      return
    }
    setD(data)
    onLoaded?.(data)
  }, [api, onLoaded, onMissing])
  useEffect(() => { load() }, [load])

  async function act(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.error || 'Алдаа гарлаа')
      if (res.status === 409) load()
      return false
    }
    return true
  }

  if (error) {
    return (
      <div className="page-wide" style={{ maxWidth: 760 }}>
        <Link href={backHref} style={back}>← {backLabel}</Link>
        <p className="msg-error">{error}</p>
      </div>
    )
  }
  if (!d) return <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>

  const step = stepOf(d.status)
  const closed = d.status === 'REJECTED' || d.status === 'TERMINATED'

  return (
    <div className="page-wide ct-page" style={{ maxWidth: 760 }}>
      <style>{CSS}</style>
      <Link href={backHref} style={back}>← {backLabel}</Link>
      <p className="ct-eyebrow">Эрээнд ачаа хүлээн авах гэрээ</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
        <h1 className="section-title" style={{ margin: 0 }}>{d.warehouse.name}</h1>
        <StatusBadge status={d.status} />
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: '0 0 1.1rem' }}>
        Гэрээ № {d.contractNo}
        {d.viaLink && d.me.email && <> · энэ хуудасны холбоосыг <b style={{ color: 'var(--text)' }}>{d.me.email}</b> хаяг руу илгээсэн</>}
      </p>

      {!closed && (
        <ol className="ct-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'done' : i === step ? 'on' : ''}>
              <span>{i < step ? '✓' : i + 1}</span>{s}
            </li>
          ))}
        </ol>
      )}

      {!d.canManage && (
        <p className="ct-readonly">Зөвхөн харах горим. Төлбөр мэдэгдэх, цуцлах зэргийг гэрээ байгуулсан хүн и-мэйлээр ирсэн гэрээний холбоосоор хийнэ.</p>
      )}
      {d.status === 'AWAITING_PAYMENT' && <PaymentPanel d={d} act={act} reload={load} />}
      {d.status === 'PAYMENT_REVIEW' && <ReviewPanel d={d} />}
      {(d.status === 'ACTIVE' || d.status === 'TERMINATION_PENDING') && <ActivePanel d={d} act={act} reload={load} pdfHref={links.pdfHref} />}
      {!d.cargoLinked && d.status === 'ACTIVE' && links.signupHref && (
        <div className="card ct-panel" style={{ borderColor: 'var(--accent)', background: 'var(--accent-light)' }}>
          <Gift size={22} strokeWidth={2} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <b>Каргогоо нээж {WEBSITE_BONUS_DAYS} хоног үнэгүй ашиглаарай</b>
            <p>
              Гэрээ байгуулсны бэлэг: өөрийн вэб хаягтай карго хянах систем — хэрэглэгч тань ачаагаа өөрөө хянана.
              Гэрээ тань шинэ каргод автоматаар холбогдоно.
            </p>
            <Link href={links.signupHref} className="btn" style={btnSm}>Карго нээх →</Link>
          </div>
        </div>
      )}
      {d.status === 'REJECTED' && (
        <div className="card ct-panel ct-bad">
          <AlertTriangle size={20} />
          <div>
            <b>Гэрээ татгалзагдсан</b>
            <p>{d.rejectReason}</p>
            {d.canManage && <Link href={links.newContractHref(d.warehouse)} className="btn" style={btnSm}>Дахин гэрээ байгуулах</Link>}
          </div>
        </div>
      )}
      {d.status === 'TERMINATED' && (
        <div className="card ct-panel">
          <FileText size={20} />
          <div>
            <b>Гэрээ цуцлагдсан</b> {d.terminatedAt && <span className="ct-muted">· {formatDateTime(d.terminatedAt)}</span>}
            {d.terminationReason && <p>Шалтгаан: {d.terminationReason}</p>}
            <PdfButtons href={links.pdfHref} />
          </div>
        </div>
      )}

      {(
        <div className="ct-more">
          <details className="ct-fold">
            <summary><FileText size={16} />Гэрээний эх бичвэр</summary>
            <div className="ct-fold-body"><ContractDocument body={d.body} contractNo={d.contractNo} /></div>
          </details>
          <details className="ct-fold">
            <summary><Clock size={16} />Түүх <span>{d.events.length}</span></summary>
            <div className="ct-fold-body"><ContractTimeline events={d.events} /></div>
          </details>
        </div>
      )}
      {d.status === 'ACTIVE' && d.canManage && <TerminateBlock d={d} act={act} reload={load} />}
    </div>
  )
}

function CopyRow({ label, value, copy }: { label: string; value: string | null; copy?: string }) {
  return (
    <div className="ct-copy">
      <span>{label}</span>
      <b>{value || '—'}</b>
      {value && (
        <button aria-label={`${label} хуулах`} onClick={() => navigator.clipboard.writeText(copy ?? value).then(() => toast.success('Хуулагдлаа'))}>
          <Copy size={14} />
        </button>
      )}
    </div>
  )
}

function PaymentPanel({ d, act, reload }: { d: Detail; act: (b: Record<string, unknown>) => Promise<boolean>; reload: () => Promise<void> }) {
  const [proof, setProof] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function pick(f: File | undefined) {
    if (!f) return
    try { setProof(await resizeImage(f, 1400)) } catch { toast.error('Зураг уншигдсангүй') }
  }

  async function submit() {
    setBusy(true)
    const ok = await act({ action: 'payment', proofBase64: proof, note })
    setBusy(false)
    if (ok) { toast.success('Мэдэгдлээ. Төлбөр шалгагдсаны дараа гэрээ хүчин төгөлдөр болно'); reload() }
  }

  return (
    <div className="card ct-paycard">
      <div className="ct-payhead">
        <span>Төлөх дүн</span>
        <b>{formatMnt(d.fee)}</b>
        <small>нэг удаа · буцаагдахгүй</small>
      </div>
      <p className="ct-muted" style={{ fontSize: '0.84rem', margin: '0 0 0.6rem' }}>
        Доорх данс руу шилжүүлж, гүйлгээний утгад <b style={{ color: 'var(--text)' }}>{d.contractNo}</b> гэж заавал бичнэ үү.
      </p>
      <CopyRow label="Банк" value={d.payTo.bank} />
      <CopyRow label="Данс" value={d.payTo.account} />
      <CopyRow label="Хүлээн авагч" value={d.payTo.holder} />
      <CopyRow label="Гүйлгээний утга" value={d.contractNo} />
      <CopyRow label="Дүн" value={formatMnt(d.fee)} copy={String(Math.round(Number(d.fee)))} />
      {d.canManage && (
        <div className="ct-payact">
          <details className="ct-proof">
            <summary>Баримт, тайлбар хавсаргах <span>(заавал биш)</span></summary>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => pick(e.target.files?.[0])} />
          {proof ? (
            <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proof} alt="Гүйлгээний баримт" style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 8, background: 'var(--surface2)' }} />
              <button className="ct-link" onClick={() => setProof(null)}>Солих</button>
            </div>
          ) : (
            <button className="btn-ghost" style={{ width: '100%', marginBottom: '0.6rem' }} onClick={() => fileRef.current?.click()}>
              Гүйлгээний баримтын зураг хавсаргах
            </button>
          )}
          <textarea className="input" rows={2} placeholder="Жш. Хаан банкнаас 09/17 шилжүүлсэн"
            value={note} onChange={e => setNote(e.target.value)} />
          </details>
          <button className="btn btn-lg" style={{ width: '100%' }} disabled={busy} onClick={submit}>
            <CheckCircle2 size={18} />{busy ? 'Илгээж байна...' : 'Төлбөр төлсөн'}
          </button>
          <p className="ct-expect"><Clock size={14} />Төлбөрийг ихэнхдээ 24 цагийн дотор шалгаж, и-мэйлээр мэдэгдэнэ.</p>
        </div>
      )}
    </div>
  )
}

function ReviewPanel({ d }: { d: Detail }) {
  return (
    <div className="card ct-panel ct-info">
      <Clock size={20} />
      <div>
        <b>Төлбөрийг шалгаж байна</b>
        <p>
          Та {d.paymentClaimedAt ? formatDateTime(d.paymentClaimedAt) : ''}-нд төлбөр төлснөө мэдэгдсэн. Ихэнхдээ 24 цагийн
          дотор шалгана — гэрээ хүчин төгөлдөр болмогц и-мэйлээр мэдэгдэж, агуулах тантай холбогдоно.
        </p>
        {d.paymentProofUrl && <a href={d.paymentProofUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>Хавсаргасан баримт ↗</a>}
      </div>
    </div>
  )
}

function PdfButtons({ href }: { href: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
      <a className="btn" style={btnSm} href={href} target="_blank" rel="noreferrer"><FileText size={14} /> PDF нээх / хэвлэх</a>
      <a className="btn-ghost" style={btnSm} href={href} download><Download size={14} /> Татах</a>
    </div>
  )
}

// Гэрээгээр авсан Эрээний хаяг — каргогийн хэрэглэгчид Taobao зэрэгт бичнэ; нэг товчоор вэбсайтад тохируулна
function AddressPanel({ d, act, reload }: { d: Detail; act: (b: Record<string, unknown>) => Promise<boolean>; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const a = d.receiveAddress
  if (!a) {
    const w = d.warehouse
    return (
      <div className="card ct-panel ct-info">
        <MessagesSquare size={22} />
        <div style={{ flex: 1 }}>
          <b>Агуулах тантай холбогдоно</b>
          <p>Эрээнд ачаа хүлээн авах хаяг, тэмдгээ агуулахтай чатаар тохирно. Агуулах удахгүй тантай холбогдоно — хүлээлгүй өөрөө ч холбогдож болно.</p>
          {(w.phone || w.wechat) && (
            <div style={{ marginTop: '0.6rem' }}>
              {w.phone && <CopyRow label="Утас" value={w.phone} />}
              {w.wechat && <CopyRow label="WeChat" value={w.wechat} />}
              {w.phone && (
                <a className="btn-ghost" style={{ ...btnSm, marginTop: '0.6rem' }} href={`tel:${w.phone.replace(/\s/g, '')}`}><Phone size={14} /> Залгах</a>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }
  async function apply() {
    if (!await confirmAsync('Вэбсайтын тань "Эрээний хаяг"-ийг энэ хаягаар солих уу? Хуучин хаяг дарагдана.')) return
    setBusy(true)
    const ok = await act({ action: 'use-address' })
    setBusy(false)
    if (ok) { toast.success('Вэбсайтын Эрээний хаяг шинэчлэгдлээ'); reload() }
  }
  return (
    <div className="card" style={{ padding: '1rem 1.2rem', marginBottom: '1.2rem', borderColor: 'var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
        <MapPin size={18} style={{ color: 'var(--accent)' }} />
        <b style={{ fontSize: '0.95rem' }}>Таны Эрээнд ачаа хүлээн авах хаяг</b>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--muted)' }}>Тэмдэг: <b style={{ color: 'var(--text)' }}>{d.cargoMark}</b></span>
      </div>
      <CopyRow label="收货人 (Нэр)" value={a.receiver} />
      <CopyRow label="手机号 (Утас)" value={a.phone} />
      <CopyRow label="地区 (Бүс)" value={a.region} />
      <CopyRow label="详细地址 (Хаяг)" value={a.address} />
      {d.canManage && d.cargoLinked && (
        d.addressApplied ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--green)', margin: '0.7rem 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={15} /> Вэбсайтад тань тохируулагдсан — хэрэглэгчид "Хаяг" хэсгээс харна.
          </p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
            <button className="btn" style={btnSm} disabled={busy} onClick={apply}>{busy ? '...' : 'Энэ хаягийг вэбсайтдаа ашиглах'}</button>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Хэрэглэгчдэд харагдах "Эрээний хаяг" солигдоно.</span>
          </div>
        )
      )}
    </div>
  )
}

function ActivePanel({ d, act, reload, pdfHref }: { d: Detail; act: (b: Record<string, unknown>) => Promise<boolean>; reload: () => Promise<void>; pdfHref: string }) {
  const pending = d.status === 'TERMINATION_PENDING'

  async function cancel() {
    if (!await confirmAsync('Цуцлах мэдэгдлээ буцаах уу?')) return
    if (await act({ action: 'cancel-termination' })) { toast.success('Гэрээ хүчинтэй хэвээр'); reload() }
  }

  return (
    <>
      {/* Хамгийн чухал нь — агуулахтай холбогдож хаягаа авах */}
      <AddressPanel d={d} act={act} reload={reload} />

      <div className={`card ct-panel ${pending ? 'ct-warn' : 'ct-ok'}`}>
        {pending ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
        <div style={{ flex: 1 }}>
          {pending ? (
            <>
              <b>{d.terminationEffectiveAt ? formatDateTime(d.terminationEffectiveAt).slice(0, 10) : ''}-нд цуцлагдана</b>
              <p>
                {d.terminationRequestedBy === 'CARGO' ? 'Та' : 'Агуулах'} цуцлах мэдэгдэл өгсөн. Шалтгаан: {d.terminationReason}
              </p>
              {d.terminationRequestedBy === 'CARGO' && d.canManage && (
                <button className="btn-ghost" style={btnSm} onClick={cancel}>Мэдэгдлээ буцаах</button>
              )}
            </>
          ) : (
            <>
              <b>Гэрээ хүчин төгөлдөр</b>
              <p>{d.approvedAt ? formatDateTime(d.approvedAt) : ''}-нд баталгаажсан. Агуулах танай ачааг хүлээн авч эхэлнэ.</p>
            </>
          )}
          {d.warehouseNote && <p className="ct-note">Агуулахын тэмдэглэл: {d.warehouseNote}</p>}
          {PDF_STATUSES.includes(d.status) && <PdfButtons href={pdfHref} />}
        </div>
      </div>
    </>
  )
}

// Цуцлах — хуудасны хамгийн доор, чимээгүй линк (гол урсгалд саад болохгүй)
function TerminateBlock({ d, act, reload }: { d: Detail; act: (b: Record<string, unknown>) => Promise<boolean>; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function terminate() {
    setBusy(true)
    const ok = await act({ action: 'terminate', reason })
    setBusy(false)
    if (ok) { setOpen(false); toast.success('Цуцлах мэдэгдэл илгээлээ'); reload() }
  }

  return (
    <div className="ct-terminate">
      {!open ? (
        <button className="ct-link ct-link-muted" onClick={() => setOpen(true)}>Гэрээ цуцлах…</button>
      ) : (
        <div className="card" style={{ padding: '1rem 1.1rem', borderColor: 'var(--danger)' }}>
          <b style={{ fontSize: '0.9rem' }}>Гэрээ цуцлах мэдэгдэл</b>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.3rem 0 0.6rem' }}>
            Гэрээ {TERMINATION_NOTICE_DAYS} хоногийн дараа цуцлагдана. Гэрээний төлбөр ({formatMnt(d.fee)}) буцаагдахгүй.
          </p>
          <textarea className="input" rows={2} placeholder="Цуцлах шалтгаан" value={reason} onChange={e => setReason(e.target.value)} />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
            <button className="btn" style={{ background: 'var(--danger)' }} disabled={busy || reason.trim().length < 3} onClick={terminate}>
              {busy ? '...' : 'Цуцлах мэдэгдэл өгөх'}
            </button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Болих</button>
          </div>
        </div>
      )}
    </div>
  )
}

const back: React.CSSProperties = { fontSize: '0.82rem', color: 'var(--muted)', display: 'inline-block', marginBottom: '0.6rem' }
const h3: React.CSSProperties = { fontSize: '0.92rem', fontWeight: 700, margin: '0 0 0.8rem' }
const btnSm: React.CSSProperties = { padding: '0.4rem 0.8rem', fontSize: '0.8rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }

const CSS = `
.ct-eyebrow { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); margin: 0.6rem 0 0.2rem; }
.ct-paycard { padding: 1.2rem 1.25rem; margin-bottom: 1.2rem; }
.ct-payhead { display: flex; flex-direction: column; align-items: flex-start; padding: 0.85rem 1rem; margin-bottom: 0.85rem; border-radius: 12px; background: linear-gradient(135deg, var(--accent-light), var(--surface2)); }
.ct-payhead span { font-size: 0.75rem; color: var(--muted); }
.ct-payhead b { font-size: 1.7rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; color: var(--accent); font-variant-numeric: tabular-nums; }
.ct-payhead small { font-size: 0.72rem; color: var(--muted); }
.ct-payact { margin-top: 1rem; }
.ct-proof { margin-bottom: 0.7rem; }
.ct-proof summary { cursor: pointer; font-size: 0.82rem; font-weight: 600; color: var(--accent); margin-bottom: 0.5rem; list-style: none; }
.ct-proof summary::-webkit-details-marker { display: none; }
.ct-proof summary span { color: var(--muted); font-weight: 400; }
.ct-expect { display: flex; align-items: center; justify-content: center; gap: 0.35rem; font-size: 0.76rem; color: var(--muted); margin: 0.6rem 0 0; text-align: center; }
.ct-more { display: flex; flex-direction: column; gap: 0.6rem; margin-top: 0.4rem; }
.ct-fold { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.ct-fold > summary { display: flex; align-items: center; gap: 0.5rem; padding: 0.85rem 1rem; cursor: pointer; font-weight: 600; font-size: 0.88rem; list-style: none; }
.ct-fold > summary::-webkit-details-marker { display: none; }
.ct-fold > summary svg { color: var(--muted); }
.ct-fold > summary span { font-size: 0.7rem; font-weight: 700; color: var(--muted); background: var(--surface2); border-radius: 100px; padding: 0 0.45rem; line-height: 1.6; }
.ct-fold > summary::after { content: "+"; margin-left: auto; color: var(--muted); font-size: 1.1rem; font-weight: 400; }
.ct-fold[open] > summary::after { content: "−"; }
.ct-fold-body { padding: 0 1rem 1rem; }
.ct-terminate { margin-top: 1.4rem; text-align: center; }
.ct-link-muted { color: var(--muted) !important; font-weight: 500 !important; }
.ct-link-muted:hover { color: var(--danger) !important; }
.ct-muted { color: var(--muted); }
.ct-steps { list-style: none; display: flex; gap: 0.4rem; padding: 0; margin: 0 0 1.25rem; overflow-x: auto; }
.ct-steps li { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: var(--muted); white-space: nowrap;
  padding: 0.35rem 0.7rem 0.35rem 0.4rem; border-radius: 100px; border: 1px solid var(--border); background: var(--surface); }
.ct-steps li span { width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  background: var(--surface2); font-weight: 700; font-size: 0.7rem; }
.ct-steps li.on { color: var(--text); border-color: var(--accent); font-weight: 600; }
.ct-steps li.on span { background: var(--accent); color: var(--on-accent); }
.ct-steps li.done span { background: var(--green); color: var(--on-accent); }
.ct-draft { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 1.25rem; align-items: start; }
.ct-preview { position: sticky; top: 0.75rem; }
.ct-fee { display: flex; flex-direction: column; background: var(--surface2); border-radius: 10px; padding: 0.7rem 0.85rem; margin-bottom: 0.8rem; }
.ct-fee span { font-size: 0.72rem; color: var(--muted); }
.ct-fee b { font-size: 1.4rem; }
.ct-fee small { font-size: 0.72rem; color: var(--danger); font-weight: 600; }
.ct-agree { display: flex; gap: 0.55rem; align-items: flex-start; font-size: 0.8rem; line-height: 1.5; margin-bottom: 0.8rem; cursor: pointer; }
.ct-agree input { margin-top: 3px; width: 16px; height: 16px; flex-shrink: 0; }
.ct-link { background: none; border: none; padding: 0; color: var(--accent); cursor: pointer; font: inherit; font-size: 0.8rem; font-weight: 600; }
.ct-readonly { font-size: 0.8rem; color: var(--muted); background: var(--surface2); border-radius: 10px; padding: 0.6rem 0.85rem; margin: 0 0 1rem; }
.ct-panel { display: flex; gap: 0.8rem; align-items: flex-start; padding: 1rem 1.2rem; margin-bottom: 1.2rem; }
.ct-panel p { font-size: 0.84rem; margin: 0.25rem 0 0.2rem; line-height: 1.55; }
.ct-panel > svg { flex-shrink: 0; margin-top: 2px; }
.ct-ok { border-color: color-mix(in srgb, var(--green) 45%, var(--border)); } .ct-ok > svg { color: var(--green); }
.ct-warn { border-color: var(--orange); } .ct-warn > svg { color: var(--orange); }
.ct-bad { border-color: var(--danger); } .ct-bad > svg { color: var(--danger); }
.ct-info { border-color: var(--blue); } .ct-info > svg { color: var(--blue); }
.ct-note { background: var(--surface2); border-radius: 8px; padding: 0.5rem 0.7rem; }
.ct-pay { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; margin-bottom: 1.2rem; align-items: start; }
.ct-copy { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
.ct-copy span { width: 110px; color: var(--muted); flex-shrink: 0; font-size: 0.78rem; }
.ct-copy b { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.ct-copy button { background: none; border: 1px solid var(--border); border-radius: 7px; width: 30px; height: 30px; cursor: pointer; color: var(--muted);
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ct-two { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 1.25rem; align-items: start; }
.ct-doc summary { cursor: pointer; font-weight: 700; font-size: 0.9rem; margin-bottom: 0.7rem; }
@media (max-width: 900px) {
  .ct-draft, .ct-two { grid-template-columns: minmax(0, 1fr); }
  .ct-preview { position: static; }
}
`

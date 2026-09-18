'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, Download, FileText, CheckCircle2, Clock, AlertTriangle, MapPin } from 'lucide-react'
import { ContractDocument, ContractTimeline, StatusBadge, ContractEventRow } from '@/app/components/ContractDocument'
import type { CargoField, ContractBody, ReceiveAddress } from '@/lib/contract'
import { formatDateTime, TERMINATION_NOTICE_DAYS, PDF_STATUSES, ContractStatus, WEBSITE_BONUS_DAYS } from '@/lib/contract'
import { formatMnt } from '@/lib/warehouse'
import { resizeImage } from '@/lib/image-resize'

interface Detail {
  id: number
  contractNo: string
  status: ContractStatus
  values: Record<string, string>
  fields: CargoField[]
  body: ContractBody
  previewHash: string | null
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
  warehouse: { id: number; name: string; slug: string | null }
  warehouseReady: boolean
  canManage: boolean
  guest: boolean
  me: { name: string; email: string | null }
}

// Б талын гэрээний ажлын хэсэг — нэвтэрсэн карго (/admin/warehouse/[id]) болон нууц холбоостой зочин (/contracts/g/[token])
interface Links {
  api: string
  pdfHref: string
  backHref: string
  backLabel: string
  newContractHref: (warehouse: { id: number; slug: string | null }) => string
  afterDeleteHref: string
  // Бүртгэлгүй хүний хүчинтэй гэрээнд: каргогоо нээж 60 хоног үнэгүй ашиглах санал
  signupHref?: string
  onLoaded?: (d: { contractNo: string; warehouse: { id: number; name: string } }) => void
  onMissing?: () => void
}

const STEPS = ['Мэдээлэл бөглөх', 'Цахимаар баталгаажуулах', 'Төлбөр төлөх', 'Гэрээ хүчинтэй']

function stepOf(s: ContractStatus): number {
  if (s === 'DRAFT') return 0
  if (s === 'AWAITING_PAYMENT') return 2
  if (s === 'PAYMENT_REVIEW') return 2
  return 3
}

export default function ContractWorkspace(links: Links) {
  const { api, backHref, backLabel, onLoaded, onMissing } = links
  const router = useRouter()
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
      <div className="page-wide" style={{ maxWidth: 1100 }}>
        <Link href={backHref} style={back}>← {backLabel}</Link>
        <p className="msg-error">{error}</p>
      </div>
    )
  }
  if (!d) return <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>

  const step = stepOf(d.status)
  const closed = d.status === 'REJECTED' || d.status === 'TERMINATED'

  return (
    <div className="page-wide" style={{ maxWidth: 1100 }}>
      <style>{CSS}</style>
      <Link href={backHref} style={back}>← {backLabel}</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
        <h1 className="section-title" style={{ margin: 0 }}>{d.warehouse.name}</h1>
        <StatusBadge status={d.status} />
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: '0 0 1.1rem' }}>
        Гэрээ № {d.contractNo}
        {d.guest && d.me.email && <> · {d.me.email} · <span style={{ color: '#d97706' }}>энэ хуудасны холбоосыг хадгалж авна уу, бусадтай хуваалцахгүй</span></>}
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

      {d.status === 'DRAFT' && <DraftPanel d={d} api={api} reload={load} act={act} onDeleted={() => router.push(links.afterDeleteHref)} />}
      {d.status === 'AWAITING_PAYMENT' && <PaymentPanel d={d} act={act} reload={load} />}
      {d.status === 'PAYMENT_REVIEW' && <ReviewPanel d={d} />}
      {(d.status === 'ACTIVE' || d.status === 'TERMINATION_PENDING') && <ActivePanel d={d} act={act} reload={load} pdfHref={links.pdfHref} />}
      {d.guest && d.status === 'ACTIVE' && links.signupHref && (
        <div className="card ct-panel" style={{ borderColor: 'var(--accent)', background: 'var(--accent-light)' }}>
          <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>🎁</span>
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

      {d.status !== 'DRAFT' && (
        <div className="ct-two">
          <details className="ct-doc" open={d.status === 'AWAITING_PAYMENT'}>
            <summary>Гэрээний эх бичвэр</summary>
            <ContractDocument body={d.body} contractNo={d.contractNo} />
          </details>
          <div className="card" style={{ padding: '1rem 1.1rem' }}>
            <h3 style={h3}>Түүх</h3>
            <ContractTimeline events={d.events} />
          </div>
        </div>
      )}
    </div>
  )
}

function DraftPanel({ d, api, reload, act, onDeleted }: {
  d: Detail; api: string; reload: () => Promise<void>
  act: (b: Record<string, unknown>) => Promise<boolean>; onDeleted: () => void
}) {
  const [values, setValues] = useState(d.values)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [agree, setAgree] = useState(false)
  const [signer, setSigner] = useState(d.me.name)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const missing = d.fields.filter(f => !values[f.key]?.trim())

  const save = useCallback(async (v: Record<string, string>) => {
    setSaving(true)
    const res = await fetch(api, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: v }) })
    setSaving(false)
    if (!res.ok) { toast.error('Хадгалж чадсангүй'); return false }
    setDirty(false)
    await reload()
    return true
  }, [api, reload])

  // Бичиж дуусахад автоматаар хадгалж, урьдчилсан харагдацыг шинэчилнэ
  function change(key: string, v: string) {
    const next = { ...values, [key]: v }
    setValues(next)
    setDirty(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save(next), 900)
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function sign() {
    if (timer.current) clearTimeout(timer.current)
    if (dirty && !await save(values)) return
    setBusy(true)
    // Хадгалсны дараах хамгийн сүүлийн текстийн hash-ийг ашиглана
    const fresh = await fetch(api).then(r => r.ok ? r.json() : null).catch(() => null)
    const ok = await act({ action: 'sign', signerName: signer, agree, previewHash: fresh?.previewHash ?? d.previewHash })
    setBusy(false)
    if (!ok) return
    toast.success('Гэрээг баталгаажууллаа')
    await reload()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function remove() {
    if (!confirm('Энэ ноорог гэрээг устгах уу?')) return
    const res = await fetch(api, { method: 'DELETE' })
    if (res.ok) onDeleted()
    else toast.error('Устгаж чадсангүй')
  }

  if (!d.warehouseReady) {
    return (
      <div className="card ct-panel ct-bad">
        <AlertTriangle size={20} />
        <div>
          <b>Энэ агуулах одоогоор цахим гэрээ хүлээн авахгүй байна.</b>
          <p>Дараа дахин оролдоно уу.</p>
          {d.canManage && <button className="btn-ghost" style={btnSm} onClick={remove}>Ноорог устгах</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="ct-draft">
      <div className="ct-form">
        <div className="card" style={{ padding: '1.1rem 1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3 style={h3}>1. Танай байгууллагын мэдээлэл</h3>
            <span className="ct-muted" style={{ fontSize: '0.72rem' }}>{saving ? 'Хадгалж байна...' : dirty ? 'Өөрчлөгдсөн' : 'Хадгалагдсан'}</span>
          </div>
          {d.fields.map(f => (
            <div key={f.key} className="form-group" style={{ marginBottom: '0.6rem' }}>
              <label>{f.label}</label>
              <input className="input" value={values[f.key] ?? ''} placeholder={f.placeholder} maxLength={f.max}
                disabled={!d.canManage} onChange={e => change(f.key, e.target.value)} />
            </div>
          ))}
        </div>

        {d.canManage ? (
          <div className="card" style={{ padding: '1.1rem 1.2rem', marginTop: '1rem' }}>
            <h3 style={h3}>2. Цахимаар баталгаажуулах</h3>
            {missing.length > 0 ? (
              <p className="ct-muted" style={{ fontSize: '0.82rem', margin: 0 }}>
                Дутуу: {missing.map(f => f.label).join(', ')}
              </p>
            ) : (
              <>
                <div className="ct-fee">
                  <span>Гэрээний төлбөр</span>
                  <b>{formatMnt(d.fee)}</b>
                  <small>Нэг удаагийн · цуцлагдсан ч буцаагдахгүй</small>
                </div>
                <label className="ct-agree">
                  <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
                  <span>
                    Гэрээг бүрэн уншиж танилцсан, нөхцөлийг зөвшөөрч байна. Гэрээний төлбөр нэг удаагийн бөгөөд
                    гэрээ цуцлагдсан ч буцаагдахгүй гэдгийг ойлгосон.
                  </span>
                </label>
                <div className="form-group" style={{ marginBottom: '0.6rem' }}>
                  <label>Баталгаажуулж буй хүний бүтэн нэр</label>
                  <input className="input" value={signer} onChange={e => setSigner(e.target.value)} />
                </div>
                <button className="btn" style={{ width: '100%' }} disabled={!agree || signer.trim().length < 3 || busy || saving}
                  onClick={sign}>
                  {busy ? 'Баталгаажуулж байна...' : 'Гэрээг баталгаажуулах'}
                </button>
                <p className="ct-muted" style={{ fontSize: '0.72rem', margin: '0.5rem 0 0', lineHeight: 1.5 }}>
                  Энэ товчийг дарснаар гэрээнд цахимаар гарын үсэг зурсанд тооцогдоно. Таны нэр, огноо, IP хаяг гэрээнд бүртгэгдэнэ.
                </p>
              </>
            )}
            <button className="ct-link" style={{ marginTop: '0.9rem', color: 'var(--danger)' }} onClick={remove}>Ноорог устгах</button>
          </div>
        ) : (
          <p className="ct-muted" style={{ fontSize: '0.8rem', marginTop: '0.8rem' }}>Гэрээг зөвхөн каргогийн эзэмшигч баталгаажуулна.</p>
        )}
      </div>

      <div className="ct-preview">
        <div className="ct-muted" style={{ fontSize: '0.76rem', marginBottom: '0.4rem' }}>
          Урьдчилан харах — шар хэсгийг зүүн талд бөглөнө
        </div>
        <ContractDocument body={d.body} contractNo={d.contractNo} maxHeight="calc(100vh - 140px)" />
      </div>
    </div>
  )
}

function CopyRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="ct-copy">
      <span>{label}</span>
      <b>{value || '—'}</b>
      {value && (
        <button aria-label={`${label} хуулах`} onClick={() => navigator.clipboard.writeText(value).then(() => toast.success('Хуулагдлаа'))}>
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
    <div className="ct-pay">
      <div className="card" style={{ padding: '1.1rem 1.2rem' }}>
        <h3 style={h3}>3. Гэрээний төлбөр төлөх</h3>
        <p className="ct-muted" style={{ fontSize: '0.8rem', margin: '0 0 0.8rem' }}>
          Доорх данс руу шилжүүлж, гүйлгээний утгад гэрээний дугаарыг заавал бичнэ үү.
        </p>
        <CopyRow label="Банк" value={d.payTo.bank} />
        <CopyRow label="Данс" value={d.payTo.account} />
        <CopyRow label="Хүлээн авагч" value={d.payTo.holder} />
        <CopyRow label="Дүн" value={String(Math.round(Number(d.fee)))} />
        <CopyRow label="Гүйлгээний утга" value={d.contractNo} />
        <p style={{ fontSize: '0.74rem', color: 'var(--muted)', margin: '0.7rem 0 0' }}>
          {formatMnt(d.fee)} · нэг удаагийн, буцаагдахгүй
        </p>
      </div>
      {d.canManage && (
        <div className="card" style={{ padding: '1.1rem 1.2rem' }}>
          <h3 style={h3}>Төлбөр төлсөн бол мэдэгдэнэ үү</h3>
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
          <textarea className="input" rows={2} placeholder="Тайлбар (заавал биш): жш. Хаан банкнаас 09/17 шилжүүлсэн"
            value={note} onChange={e => setNote(e.target.value)} />
          <button className="btn" style={{ width: '100%', marginTop: '0.6rem' }} disabled={busy || (!proof && !note.trim())} onClick={submit}>
            {busy ? 'Илгээж байна...' : 'Төлбөр төлсөн'}
          </button>
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
          Та {d.paymentClaimedAt ? formatDateTime(d.paymentClaimedAt) : ''}-нд төлбөр төлснөө мэдэгдсэн. Агуулахын дансанд
          орсныг шалгасны дараа гэрээ хүчин төгөлдөр болж, и-мэйлээр мэдэгдэнэ.
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
    return (
      <div className="card ct-panel ct-info">
        <MapPin size={22} />
        <div><b>Эрээнд ачаа хүлээн авах хаяг</b><p>Агуулах танд тэмдэг олгож, хаяг бэлтгэж байна. Бэлэн болмогц энд харагдана.</p></div>
      </div>
    )
  }
  async function apply() {
    if (!confirm('Вэбсайтын тань "Эрээний хаяг"-ийг энэ хаягаар солих уу? Хуучин хаяг дарагдана.')) return
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
      {d.canManage && !d.guest && (
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
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = d.status === 'TERMINATION_PENDING'

  async function terminate() {
    setBusy(true)
    const ok = await act({ action: 'terminate', reason })
    setBusy(false)
    if (ok) { setOpen(false); toast.success('Цуцлах мэдэгдэл илгээлээ'); reload() }
  }
  async function cancel() {
    if (!confirm('Цуцлах мэдэгдлээ буцаах уу?')) return
    if (await act({ action: 'cancel-termination' })) { toast.success('Гэрээ хүчинтэй хэвээр'); reload() }
  }

  return (
    <>
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

      <AddressPanel d={d} act={act} reload={reload} />

      {!pending && d.canManage && (
        <div style={{ margin: '-0.4rem 0 1.2rem' }}>
          {!open ? (
            <button className="ct-link" style={{ color: 'var(--danger)' }} onClick={() => setOpen(true)}>Гэрээ цуцлах</button>
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
      )}
    </>
  )
}

const back: React.CSSProperties = { fontSize: '0.82rem', color: 'var(--muted)', display: 'inline-block', marginBottom: '0.6rem' }
const h3: React.CSSProperties = { fontSize: '0.92rem', fontWeight: 700, margin: '0 0 0.8rem' }
const btnSm: React.CSSProperties = { padding: '0.4rem 0.8rem', fontSize: '0.8rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }

const CSS = `
.ct-muted { color: var(--muted); }
.ct-steps { list-style: none; display: flex; gap: 0.4rem; padding: 0; margin: 0 0 1.25rem; overflow-x: auto; }
.ct-steps li { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: var(--muted); white-space: nowrap;
  padding: 0.35rem 0.7rem 0.35rem 0.4rem; border-radius: 100px; border: 1px solid var(--border); background: var(--surface); }
.ct-steps li span { width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  background: var(--surface2); font-weight: 700; font-size: 0.7rem; }
.ct-steps li.on { color: var(--text); border-color: var(--accent); font-weight: 600; }
.ct-steps li.on span { background: var(--accent); color: #fff; }
.ct-steps li.done span { background: var(--green); color: #fff; }
.ct-draft { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 1.25rem; align-items: start; }
.ct-preview { position: sticky; top: 0.75rem; }
.ct-fee { display: flex; flex-direction: column; background: var(--surface2); border-radius: 10px; padding: 0.7rem 0.85rem; margin-bottom: 0.8rem; }
.ct-fee span { font-size: 0.72rem; color: var(--muted); }
.ct-fee b { font-size: 1.4rem; }
.ct-fee small { font-size: 0.72rem; color: var(--danger); font-weight: 600; }
.ct-agree { display: flex; gap: 0.55rem; align-items: flex-start; font-size: 0.8rem; line-height: 1.5; margin-bottom: 0.8rem; cursor: pointer; }
.ct-agree input { margin-top: 3px; width: 16px; height: 16px; flex-shrink: 0; }
.ct-link { background: none; border: none; padding: 0; color: var(--accent); cursor: pointer; font: inherit; font-size: 0.8rem; font-weight: 600; }
.ct-panel { display: flex; gap: 0.8rem; align-items: flex-start; padding: 1rem 1.2rem; margin-bottom: 1.2rem; }
.ct-panel p { font-size: 0.84rem; margin: 0.25rem 0 0.2rem; line-height: 1.55; }
.ct-panel > svg { flex-shrink: 0; margin-top: 2px; }
.ct-ok { border-color: color-mix(in srgb, var(--green) 45%, var(--border)); } .ct-ok > svg { color: var(--green); }
.ct-warn { border-color: #ea580c; } .ct-warn > svg { color: #ea580c; }
.ct-bad { border-color: var(--danger); } .ct-bad > svg { color: var(--danger); }
.ct-info { border-color: #2563eb; } .ct-info > svg { color: #2563eb; }
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

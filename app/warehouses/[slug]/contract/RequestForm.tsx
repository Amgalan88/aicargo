'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Send, Mail, FileText, ChevronDown, ShieldCheck, Banknote, MessagesSquare } from 'lucide-react'
import type { CargoField, ContractBody } from '@/lib/contract'

const STEPS = [
  { icon: Send, title: 'Хүсэлт', desc: 'Мэдээллээ бөглөж гэрээг зөвшөөрнө' },
  { icon: Banknote, title: 'Төлбөр', desc: 'Агуулахын дансанд шилжүүлнэ' },
  { icon: MessagesSquare, title: 'Холбогдоно', desc: 'Агуулах хаяг, тэмдгээ тантай чатаар тохирно' },
]

export default function RequestForm({ warehouseId, warehouseName, fee, fields, prefill, loggedInCargo }: {
  warehouseId: number
  warehouseName: string
  fee: string
  fields: CargoField[]
  prefill: Record<string, string> | null
  loggedInCargo: boolean
}) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>({ destination: 'Улаанбаатар хот', ...(prefill ?? {}) })
  const [email, setEmail] = useState('')
  const [agree, setAgree] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<ContractBody | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [docOpen, setDocOpen] = useState(false)
  const [website, setWebsite] = useState('') // honeypot

  const required = fields.filter(f => !f.optional)
  const optional = fields.filter(f => f.optional)
  const missing = required.filter(f => !values[f.key]?.trim())
  const emailOk = loggedInCargo || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
  const canStart = missing.length === 0 && emailOk && agree

  async function post(payload: Record<string, unknown>) {
    const res = await fetch('/api/public/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouseId, values, email: email.trim(), website, ...payload }),
    })
    const d = await res.json().catch(() => ({}))
    return { ok: res.ok, d }
  }

  // Нээх бүрт одоогийн бөглөсөн мэдээллээр шинэчилнэ (нэр, хаяг гэрээнд тэр дор нь харагдана)
  async function loadPreview() {
    setPreviewError('')
    try {
      const { ok, d } = await post({ step: 'preview' })
      if (ok && d.body) setPreview(d.body)
      else setPreviewError(d.error || 'Гэрээний текст ачаалагдсангүй')
    } catch {
      setPreviewError('Холболтын алдаа гарлаа')
    }
  }

  // Хуудас нээгдэхэд урьдчилан ачаална — "унших" дарахад шууд харагдана
  useEffect(() => { loadPreview() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleDoc(e: React.MouseEvent) {
    // <details>-ийн onToggle зарим хөтөч/React хувилбарт найдваргүй тул товшилтоор удирдана
    e.preventDefault()
    const next = !docOpen
    setDocOpen(next)
    if (next) loadPreview()
  }

  async function requestCode() {
    setError('')
    setBusy(true)
    const { ok, d } = await post({ step: 'code' })
    setBusy(false)
    if (!ok) { setError(d.error || 'Алдаа гарлаа'); return }
    setCodeSent(true)
    toast.success(`Код ${email.trim()} хаяг руу илгээгдлээ`)
  }

  async function submit() {
    setError('')
    setBusy(true)
    const { ok, d } = await post({ step: 'submit', code, agree })
    setBusy(false)
    if (!ok) { setError(d.error || 'Алдаа гарлаа'); return }
    toast.success(d.existing ? 'Таны өмнөх хүсэлт нээгдлээ' : 'Хүсэлт илгээгдлээ! Одоо төлбөрөө төлнө үү')
    router.push(d.token ? `/contracts/g/${d.token}` : `/admin/warehouse/${d.id}`)
  }

  function field(f: CargoField) {
    return (
      <label key={f.key} className="rq-field">
        <span>{f.label}{!f.optional && <em>*</em>}</span>
        <input
          className="input"
          value={values[f.key] ?? ''}
          placeholder={f.placeholder}
          maxLength={f.max}
          inputMode={f.key === 'repPhone' ? 'tel' : undefined}
          onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
        />
      </label>
    )
  }

  return (
    <div className="rq">
      <ol className="rq-steps">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          return (
            <li key={s.title} className={i === 0 ? 'on' : ''}>
              <span className="rq-step-ic"><Icon size={16} /></span>
              <div><b>{i + 1}. {s.title}</b><small>{s.desc}</small></div>
            </li>
          )
        })}
      </ol>

      <div className="card rq-card">
        <h2>Таны мэдээлэл</h2>
        <p className="rq-sub">Хувь хүн ч гэрээ байгуулна. Одоохондоо карго нээх шаардлагагүй.</p>

        <div className="rq-grid">
          {required.map(field)}
          {!loggedInCargo && (
            <label className="rq-field rq-wide">
              <span>И-мэйл<em>*</em></span>
              <input className="input" type="email" value={email} placeholder="name@gmail.com" disabled={codeSent}
                onChange={e => setEmail(e.target.value)} />
              <small>Баталгаажуулах код болон гэрээний холбоос энэ хаяг руу очно</small>
            </label>
          )}
        </div>
        <input tabIndex={-1} autoComplete="off" aria-hidden value={website} onChange={e => setWebsite(e.target.value)}
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />

        <details className="rq-more">
          <summary><ChevronDown size={15} />Нэмэлт мэдээлэл <span>(заавал биш — байгууллага, регистр, хаяг)</span></summary>
          <div className="rq-grid">{optional.map(field)}</div>
        </details>

        <details className="rq-more" open={docOpen}>
          <summary onClick={toggleDoc}><FileText size={15} />Гэрээний текст унших</summary>
          <div className="rq-doc">
            {previewError ? (
              <p className="rq-sub">
                {previewError} · <button type="button" className="rq-link" onClick={loadPreview}>Дахин оролдох</button>
              </p>
            ) : !preview ? <p className="rq-sub">Ачаалж байна…</p> : (
              <>
                <h3>{preview.titleMn}</h3>
                {preview.clauses.map((c, i) => (
                  <p key={i} className={c.kind === 'heading' ? 'rq-doc-h' : ''}>
                    {c.no && <b>{c.no} </b>}{c.mn}
                  </p>
                ))}
              </>
            )}
          </div>
        </details>

        <label className="rq-agree">
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} disabled={codeSent} />
          <span>Гэрээний нөхцөлийг уншиж, <b>{warehouseName}</b>-тай гэрээ байгуулахыг зөвшөөрч байна. Гэрээний төлбөр {fee} (нэг удаа, буцаагдахгүй).</span>
        </label>

        {error && <p className="msg-error">{error}</p>}

        {loggedInCargo ? (
          <button className="btn btn-lg rq-btn" disabled={!canStart || busy} onClick={submit}>
            <Send size={17} />{busy ? 'Илгээж байна…' : 'Хүсэлт илгээх'}
          </button>
        ) : !codeSent ? (
          <button className="btn btn-lg rq-btn" disabled={!canStart || busy} onClick={requestCode}>
            <Mail size={17} />{busy ? 'Илгээж байна…' : 'И-мэйлээр баталгаажуулах код авах'}
          </button>
        ) : (
          <div className="rq-code">
            <label className="rq-field">
              <span>{email.trim()} хаяг руу ирсэн 6 оронтой код</span>
              <input className="input rq-code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
            </label>
            <button className="btn btn-lg rq-btn" disabled={code.length !== 6 || busy} onClick={submit}>
              <Send size={17} />{busy ? 'Илгээж байна…' : 'Хүсэлт илгээх'}
            </button>
            <div className="rq-code-links">
              <button className="rq-link" disabled={busy} onClick={requestCode}>Код дахин авах</button>
              <button className="rq-link" disabled={busy} onClick={() => { setCodeSent(false); setCode('') }}>И-мэйл засах</button>
            </div>
          </div>
        )}
        {!canStart && !codeSent && (
          <p className="rq-hint">
            {missing.length ? `Бөглөх: ${missing.map(f => f.label).join(', ')}` : !emailOk ? 'И-мэйлээ оруулна уу' : 'Гэрээг зөвшөөрөх нүдийг чагтална уу'}
          </p>
        )}
        <p className="rq-safe"><ShieldCheck size={14} />Төлбөр шууд агуулахын дансанд орно. Төлбөр баталгаажмагц агуулах тантай холбогдоно.</p>
      </div>

      {!loggedInCargo && <LostLink />}
    </div>
  )
}

// Өмнө нь хүсэлт илгээсэн хүн холбоосоо дахин авах
function LostLink() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  async function send() {
    await fetch('/api/public/contracts/request-link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }),
    }).catch(() => {})
    setSent(true)
  }
  return (
    <div className="rq-lost">
      {!open ? (
        <button className="rq-link" onClick={() => setOpen(true)}>Өмнө нь хүсэлт илгээсэн үү? Гэрээний холбоосоо и-мэйлээр авах</button>
      ) : sent ? (
        <p>Хэрэв энэ хаягаар гэрээ бүртгэлтэй бол холбоос и-мэйлээр очно.</p>
      ) : (
        <div className="rq-lost-row">
          <input className="input" type="email" placeholder="name@gmail.com" value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn-ghost" disabled={!email.includes('@')} onClick={send}>Илгээх</button>
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Send, Mail, FileText, ShieldCheck, Banknote, MessagesSquare, Link2 } from 'lucide-react'
import { completeValues, fieldError, normalizeField, segmentText } from '@/lib/contract'
import type { CargoField, ContractBody } from '@/lib/contract'

const STEPS = [
  { icon: Send, title: 'Хүсэлт', desc: 'Мэдээллээ бөглөж гэрээг зөвшөөрнө' },
  { icon: Banknote, title: 'Төлбөр', desc: 'Агуулахын дансанд шилжүүлнэ' },
  { icon: MessagesSquare, title: 'Холбогдоно', desc: 'Агуулах хаяг, тэмдгээ тантай чатаар тохирно' },
]

// Гэрээ үүсэх үед системээс бөглөгдөх талбарууд
const AUTO_TEXT: Record<string, string> = {
  contractNo: `AC${new Date().getFullYear()}-•••••`,
  signDate: '(гэрээ байгуулсан өдөр)',
}

// Гэрээний мөр — зөв бөглөсөн хэсэг ногоон, дутуу/буруу нь шараар тэмдэглэгдэнэ
function Live({ text, vars, invalid }: { text: string; vars: Record<string, string>; invalid: Set<string> }) {
  return (
    <>
      {segmentText(text, vars).map((g, i) => {
        if (!g.key) return g.text
        if (g.key in AUTO_TEXT) return <span key={i} className="rq-auto">{AUTO_TEXT[g.key]}</span>
        return <mark key={i} className={g.empty || invalid.has(g.key) ? 'rq-ph' : 'rq-fill'}>{g.text}</mark>
      })}
    </>
  )
}

export default function RequestForm({ warehouseId, warehouseName, fee, fields, prefill, cargoName }: {
  warehouseId: number
  warehouseName: string
  fee: string
  fields: CargoField[]
  prefill: { values: Record<string, string>; email: string } | null
  cargoName: string | null
}) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>({ destination: 'Улаанбаатар хот', ...(prefill?.values ?? {}) })
  const [email, setEmail] = useState(prefill?.email ?? '')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [agree, setAgree] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<ContractBody | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [docOpen, setDocOpen] = useState(false)
  const [website, setWebsite] = useState('') // honeypot

  const errors = useMemo(() => Object.fromEntries(fields.map(f => [f.key, fieldError(f.key, values[f.key])])), [fields, values])
  const firstError = fields.map(f => errors[f.key]).find(Boolean)
  // Бөглөсөн боловч буруу талбарууд (жш: регистр дутуу) — гэрээнд шараар харагдана
  const invalid = useMemo(() => new Set(fields.filter(f => values[f.key]?.trim() && errors[f.key]).map(f => f.key)), [fields, values, errors])
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
  const canStart = !firstError && emailOk && agree

  // Гэрээнд орох утгууд — сервертэй ижил хэлбэржүүлэлт (регистр том үсгээр гэх мэт)
  const vars = useMemo(
    () => completeValues(Object.fromEntries(fields.map(f => [f.key, normalizeField(f.key, values[f.key] ?? '')]))),
    [fields, values],
  )

  async function post(payload: Record<string, unknown>) {
    const res = await fetch('/api/public/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouseId, values, email: email.trim(), website, ...payload }),
    })
    const d = await res.json().catch(() => ({}))
    return { ok: res.ok, d }
  }

  // Гэрээний текстийг нэг удаа татаж, бөглөх явцад хөтөч дээр шууд шинэчилнэ
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
  useEffect(() => { loadPreview() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleDoc(e: React.MouseEvent) {
    // <details>-ийн onToggle зарим хөтөч/React хувилбарт найдваргүй тул товшилтоор удирдана
    e.preventDefault()
    setDocOpen(o => !o)
    if (!preview) loadPreview()
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
    toast.success(d.existing ? 'Таны өмнөх гэрээ нээгдлээ' : 'Хүсэлт илгээгдлээ! Одоо төлбөрөө төлнө үү')
    router.push(`/contracts/g/${d.token}`)
  }

  function field(f: CargoField) {
    const err = touched[f.key] ? errors[f.key] : null
    return (
      <label key={f.key} className={`rq-field${f.wide ? ' rq-wide' : ''}`}>
        <span>{f.label}<em>*</em></span>
        <input
          className={`input${err ? ' rq-bad' : ''}`}
          value={values[f.key] ?? ''}
          placeholder={f.placeholder}
          maxLength={f.max + 4}
          inputMode={f.inputMode}
          disabled={codeSent}
          autoCapitalize={f.key === 'cargoRegisterNo' ? 'characters' : undefined}
          onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
          onBlur={() => setTouched(t => ({ ...t, [f.key]: true }))}
        />
        {err && <small className="rq-err">{err}</small>}
      </label>
    )
  }

  const preamble = preview?.clauses[0]

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
        <h2>Гэрээ байгуулах хүний мэдээлэл</h2>
        <p className="rq-sub">Гэрээг хувь хүн (Монгол Улсын иргэн) байгуулна. Бөглөсөн мэдээлэл тань доорх гэрээнд шууд орно.</p>
        {cargoName && (
          <p className="rq-note"><Link2 size={14} />Гэрээ таны <b>{cargoName}</b> каргод мөн холбогдож, админ хэсэгт харагдана.</p>
        )}

        <div className="rq-grid">
          {fields.map(field)}
          <label className="rq-field rq-wide">
            <span>И-мэйл<em>*</em></span>
            <input className="input" type="email" value={email} placeholder="name@gmail.com" disabled={codeSent}
              onChange={e => setEmail(e.target.value)} />
            <small>Баталгаажуулах код болон гэрээний холбоос энэ хаяг руу очно</small>
          </label>
        </div>
        <input tabIndex={-1} autoComplete="off" aria-hidden value={website} onChange={e => setWebsite(e.target.value)}
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />

        {/* Гэрээний Б талын хэсэг — бөглөх явцад шууд шинэчлэгдэнэ */}
        <div className="rq-live">
          <div className="rq-live-h"><FileText size={15} />Гэрээнд ийм байдлаар орно</div>
          {previewError ? (
            <p className="rq-sub">{previewError} · <button type="button" className="rq-link" onClick={loadPreview}>Дахин оролдох</button></p>
          ) : !preamble ? <p className="rq-sub">Ачаалж байна…</p> : (
            <p className="rq-live-text"><Live text={preamble.mn} vars={vars} invalid={invalid} /></p>
          )}
        </div>

        <details className="rq-more" open={docOpen}>
          <summary onClick={toggleDoc}><FileText size={15} />Гэрээний бүтэн текст унших</summary>
          <div className="rq-doc">
            {!preview ? <p className="rq-sub">Ачаалж байна…</p> : (
              <>
                <h3>{preview.titleMn}</h3>
                {preview.clauses.map((c, i) => (
                  <p key={i} className={c.kind === 'heading' ? 'rq-doc-h' : ''}>
                    {c.no && <b>{c.no} </b>}<Live text={c.mn} vars={vars} invalid={invalid} />
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

        {!codeSent ? (
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
              <Send size={17} />{busy ? 'Илгээж байна…' : 'Гэрээ байгуулах хүсэлт илгээх'}
            </button>
            <div className="rq-code-links">
              <button className="rq-link" disabled={busy} onClick={requestCode}>Код дахин авах</button>
              <button className="rq-link" disabled={busy} onClick={() => { setCodeSent(false); setCode('') }}>Мэдээлэл засах</button>
            </div>
          </div>
        )}
        {!canStart && !codeSent && (
          <p className="rq-hint">
            {firstError ?? (!emailOk ? 'И-мэйлээ оруулна уу' : 'Гэрээг зөвшөөрөх нүдийг чагтална уу')}
          </p>
        )}
        <p className="rq-safe"><ShieldCheck size={14} />Төлбөр шууд агуулахын дансанд орно. Төлбөр баталгаажмагц агуулах тантай холбогдоно.</p>
      </div>

      <LostLink />
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

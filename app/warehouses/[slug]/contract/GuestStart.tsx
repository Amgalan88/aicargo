'use client'
import { useState } from 'react'
import { Mail } from 'lucide-react'

export default function GuestStart({ warehouseId }: { warehouseId: number }) {
  const [mode, setMode] = useState<'start' | 'resend'>('start')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await fetch(mode === 'start' ? '/api/public/contracts' : '/api/public/contracts/request-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouseId, email, website }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(data.error || 'Алдаа гарлаа'); return }
    setSentTo(email.trim())
  }

  if (sentTo) {
    return (
      <div className="card" style={{ padding: '1.4rem', borderColor: 'var(--green)', textAlign: 'center' }}>
        <Mail size={32} style={{ color: 'var(--green)' }} />
        <h2 style={{ fontSize: '1.05rem', margin: '0.5rem 0 0.3rem' }}>И-мэйлээ шалгана уу</h2>
        <p style={{ fontSize: '0.86rem', color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
          {mode === 'start'
            ? <><b style={{ color: 'var(--text)' }}>{sentTo}</b> хаяг руу гэрээний холбоос илгээлээ. Холбоосоор орж гэрээгээ үргэлжлүүлнэ.</>
            : <><b style={{ color: 'var(--text)' }}>{sentTo}</b> хаягаар гэрээ эхлүүлсэн бол холбоосыг нь дахин илгээлээ.</>}
          <br />Хэдэн минутын дотор ирэхгүй бол Spam хавтсаа шалгана уу.
        </p>
        <button className="btn-ghost" style={{ marginTop: '1rem' }} onClick={() => { setSentTo(null); setError('') }}>Буцах</button>
      </div>
    )
  }

  return (
    <form className="card" style={{ padding: '1.25rem' }} onSubmit={submit}>
      <h2 style={{ fontSize: '1rem', margin: '0 0 0.3rem' }}>
        {mode === 'start' ? 'И-мэйлээ оруулж эхлүүлнэ үү' : 'Өмнө эхлүүлсэн гэрээгээ үргэлжлүүлэх'}
      </h2>
      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 0.9rem' }}>
        {mode === 'start'
          ? 'Бүртгэл, нууц үг шаардлагагүй. Гэрээтэй холбоотой бүх мэдэгдэл энэ хаяг руу очно.'
          : 'Гэрээ эхлүүлсэн и-мэйлээ оруулбал бүх гэрээний холбоосыг дахин илгээнэ.'}
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input className="input" type="email" required autoComplete="email" placeholder="name@company.mn"
          value={email} onChange={e => setEmail(e.target.value)} style={{ flex: '1 1 220px' }} />
        <button className="btn" disabled={busy} style={{ flex: '0 0 auto' }}>
          {busy ? 'Илгээж байна...' : mode === 'start' ? 'Холбоос авах' : 'Дахин илгээх'}
        </button>
      </div>
      {/* Ботын хамгаалалт — хүнд харагдахгүй */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} aria-hidden="true" />
      {error && <p className="msg-error" style={{ margin: '0.6rem 0 0' }}>{error}</p>}
      <button type="button" onClick={() => { setMode(m => m === 'start' ? 'resend' : 'start'); setError('') }}
        style={{ background: 'none', border: 'none', padding: 0, marginTop: '0.9rem', color: 'var(--accent)', cursor: 'pointer', font: 'inherit', fontSize: '0.8rem', fontWeight: 600 }}>
        {mode === 'start' ? 'Өмнө нь эхлүүлсэн үү? Холбоосоо дахин авах' : '← Шинэ гэрээ эхлүүлэх'}
      </button>
    </form>
  )
}

'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'
import { loadGuestContracts, SavedGuestContract } from '@/lib/guest-contracts-storage'

export default function GuestStart({ warehouseId }: { warehouseId: number }) {
  const router = useRouter()
  const [mode, setMode] = useState<'start' | 'resend'>('start')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedGuestContract[]>([])

  useEffect(() => {
    setSaved(loadGuestContracts().filter(c => c.warehouseId === warehouseId))
  }, [warehouseId])

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
    if (!res.ok) { setBusy(false); setError(data.error || 'Алдаа гарлаа'); return }
    if (mode === 'start' && data.token) {
      // Гэрээний хуудас нээгдэхэд холбоосыг хөтөчид хадгална
      router.push(`/contracts/g/${data.token}`)
      return
    }
    setBusy(false)
    setSentTo(email.trim())
  }

  if (sentTo) {
    return (
      <div className="card" style={{ padding: '1.4rem', borderColor: 'var(--green)', textAlign: 'center' }}>
        <Mail size={32} style={{ color: 'var(--green)' }} />
        <h2 style={{ fontSize: '1.05rem', margin: '0.5rem 0 0.3rem' }}>И-мэйлээ шалгана уу</h2>
        <p style={{ fontSize: '0.86rem', color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
          <b style={{ color: 'var(--text)' }}>{sentTo}</b> хаягаар гэрээ эхлүүлсэн бол холбоосыг нь дахин илгээлээ.
        </p>
        <button className="btn-ghost" style={{ marginTop: '1rem' }} onClick={() => { setSentTo(null); setError('') }}>Буцах</button>
      </div>
    )
  }

  return (
    <>
      {saved.length > 0 && mode === 'start' && (
        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem', borderColor: 'var(--accent)' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem' }}>Энэ төхөөрөмж дээр эхлүүлсэн гэрээ</div>
          {saved.map(c => (
            <div key={c.token} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0' }}>
              <span style={{ fontSize: '0.85rem' }}>{c.contractNo}</span>
              <Link href={`/contracts/g/${c.token}`} className="btn" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', textDecoration: 'none' }}>
                Үргэлжлүүлэх →
              </Link>
            </div>
          ))}
        </div>
      )}

      <form className="card" style={{ padding: '1.25rem' }} onSubmit={submit}>
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.3rem' }}>
          {mode === 'start' ? (saved.length ? 'Шинэ гэрээ эхлүүлэх' : 'Гэрээ эхлүүлэх') : 'Өөр төхөөрөмж дээр эхлүүлсэн гэрээгээ олох'}
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 0.9rem' }}>
          {mode === 'start'
            ? 'Бүртгэл, нууц үг шаардлагагүй — гэрээ шууд нээгдэнэ. И-мэйлээр гэрээний холбоос нөөц болж очих ба батлагдсан тухай мэдэгдэл ирнэ.'
            : 'Гэрээ эхлүүлсэн и-мэйлээ оруулбал бүх гэрээний холбоосыг илгээнэ.'}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input className="input" type="email" required autoComplete="email" placeholder="Холбоо барих и-мэйл"
            value={email} onChange={e => setEmail(e.target.value)} style={{ flex: '1 1 220px' }} />
          <button className="btn" disabled={busy} style={{ flex: '0 0 auto' }}>
            {busy ? 'Түр хүлээнэ үү...' : mode === 'start' ? 'Гэрээ эхлүүлэх →' : 'Холбоос илгээх'}
          </button>
        </div>
        {/* Ботын хамгаалалт — хүнд харагдахгүй */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)}
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} aria-hidden="true" />
        {error && <p className="msg-error" style={{ margin: '0.6rem 0 0' }}>{error}</p>}
        <button type="button" onClick={() => { setMode(m => m === 'start' ? 'resend' : 'start'); setError('') }}
          style={{ background: 'none', border: 'none', padding: 0, marginTop: '0.9rem', color: 'var(--accent)', cursor: 'pointer', font: 'inherit', fontSize: '0.8rem', fontWeight: 600 }}>
          {mode === 'start' ? 'Өөр төхөөрөмж дээр эхлүүлсэн үү? Холбоосоо и-мэйлээр авах' : '← Гэрээ эхлүүлэх'}
        </button>
      </form>
    </>
  )
}

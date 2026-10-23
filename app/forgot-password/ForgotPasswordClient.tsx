'use client'
import { useState } from 'react'
import Link from 'next/link'
import NavLogo from '@/app/components/NavLogo'
import PhoneVerify from '@/app/components/PhoneVerify'
import PasswordInput from '@/app/components/PasswordInput'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

// Хэрэглэгч өөрөө сонгоно: утсаар (144773 руу SMS, үндсэн) эсвэл бүртгэлтэй и-мэйл рүү код
export default function ForgotPasswordClient({ cargoName, logoUrl }: { cargoName?: string; logoUrl?: string }) {
  const router = useRouter()
  const [method, setMethod] = useState<'phone' | 'email'>('phone')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const clean = email.trim().toLowerCase()
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: clean }),
    }).catch(() => null)
    setLoading(false)
    if (!res || !res.ok) {
      const d = await res?.json().catch(() => ({}))
      setError(d?.error || 'Холболтын алдаа гарлаа. Дахин оролдоно уу')
      return
    }
    router.push(`/verify-otp?email=${encodeURIComponent(clean)}`)
  }

  async function submitPhone(e: React.FormEvent) {
    e.preventDefault()
    if (!verificationId) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/reset-password-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, verificationId, newPassword: password }),
    }).catch(() => null)
    const d = await res?.json().catch(() => ({}))
    setLoading(false)
    if (!res || !res.ok) { setError(d?.error || 'Холболтын алдаа гарлаа. Дахин оролдоно уу'); return }
    toast.success('Нууц үг солигдлоо. Шинэ нууц үгээрээ нэвтэрнэ үү')
    router.push('/login')
  }

  function pick(m: 'phone' | 'email') { setMethod(m); setError('') }

  return (
    <>
      <nav className="nav">
        <Link href="/"><NavLogo name={cargoName} logoUrl={logoUrl} /></Link>
      </nav>
      <div className="page" style={{ maxWidth: 420 }}>
        <h1 className="section-title">Нууц үг сэргээх</h1>
        <div className="seg" role="tablist" style={{ marginBottom: '1.2rem' }}>
          <button type="button" role="tab" aria-selected={method === 'phone'} className={method === 'phone' ? 'on' : ''} onClick={() => pick('phone')}>📱 Утсаар</button>
          <button type="button" role="tab" aria-selected={method === 'email'} className={method === 'email' ? 'on' : ''} onClick={() => pick('email')}>✉️ И-мэйлээр</button>
        </div>

        {method === 'phone' ? (
          <form onSubmit={submitPhone}>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Бүртгэлтэй дугаараасаа код илгээж баталгаажуулаад шинэ нууц үгээ тавина.
            </p>
            <PhoneVerify purpose="reset" phone={phone} onPhone={setPhone} onVerified={setVerificationId} />
            {verificationId && (
              <div className="form-group">
                <label>Шинэ нууц үг</label>
                <PasswordInput placeholder="Хамгийн багадаа 6 тэмдэгт" required minLength={6} autoFocus autoComplete="new-password"
                  value={password} onChange={e => setPassword(e.target.value)} />
              </div>
            )}
            {error && <p className="msg-error">{error}</p>}
            <button className="btn" type="submit" disabled={loading || !verificationId} style={{ width: '100%', marginTop: '0.5rem' }}>
              {loading ? 'Хадгалж байна...' : verificationId ? 'Нууц үг солих' : 'Эхлээд утсаа баталгаажуулна уу'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitEmail}>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Бүртгэлтэй и-мэйл рүүгээ 6 оронтой код илгээнэ. 1–2 минутад ирэхгүй бол <b>Spam</b> хавтсаа шалгана уу.
            </p>
            <div className="form-group">
              <label>И-мэйл хаяг</label>
              <input className="input" type="email" placeholder="example@gmail.com" required
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            {error && <p className="msg-error">{error}</p>}
            <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: '0.5rem' }}>
              {loading ? 'Илгээж байна...' : 'Код илгээх'}
            </button>
          </form>
        )}
        <hr className="divider" />
        <Link href="/login" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>← Нэвтрэх</Link>
      </div>
    </>
  )
}

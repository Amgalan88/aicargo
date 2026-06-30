'use client'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import NavLogo from '@/app/components/NavLogo'
import { useRouter, useSearchParams } from 'next/navigation'

function VerifyOtpForm({ cargoName, logoUrl }: { cargoName?: string; logoUrl?: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const email = params.get('email') ?? ''
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    router.push(`/reset-password?token=${encodeURIComponent(data.resetToken)}`)
  }

  return (
    <>
      <nav className="nav">
        <Link href="/"><NavLogo name={cargoName} logoUrl={logoUrl} /></Link>
      </nav>
      <div className="page" style={{ maxWidth: 420 }}>
        <h1 className="section-title">Код оруулах</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          <strong style={{ color: 'var(--text)' }}>{email}</strong> хаяг руу код илгээгдлээ.
        </p>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>6 оронтой код</label>
            <input className="input" placeholder="000000" maxLength={6} required
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              style={{ fontSize: '1.4rem', letterSpacing: '6px', textAlign: 'center' }} />
          </div>
          {error && <p className="msg-error">{error}</p>}
          <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: '0.5rem' }}>
            {loading ? 'Шалгаж байна...' : 'Баталгаажуулах'}
          </button>
        </form>
        <hr className="divider" />
        <Link href="/forgot-password" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>← Дахин код авах</Link>
      </div>
    </>
  )
}

export default function VerifyOtpClient({ cargoName, logoUrl }: { cargoName?: string; logoUrl?: string }) {
  return (
    <Suspense>
      <VerifyOtpForm cargoName={cargoName} logoUrl={logoUrl} />
    </Suspense>
  )
}

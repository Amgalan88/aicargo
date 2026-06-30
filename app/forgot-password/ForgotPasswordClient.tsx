'use client'
import { useState } from 'react'
import Link from 'next/link'
import NavLogo from '@/app/components/NavLogo'
import { useRouter } from 'next/navigation'

export default function ForgotPasswordClient({ cargoName, logoUrl }: { cargoName?: string; logoUrl?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setLoading(false)
    router.push(`/verify-otp?email=${encodeURIComponent(email)}`)
  }

  return (
    <>
      <nav className="nav">
        <Link href="/"><NavLogo name={cargoName} logoUrl={logoUrl} /></Link>
      </nav>
      <div className="page" style={{ maxWidth: 420 }}>
        <h1 className="section-title">Нууц үг сэргээх</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Бүртгэлтэй и-мэйл рүүгээ 6 оронтой код илгээнэ.
        </p>
        <form onSubmit={submit}>
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
        <hr className="divider" />
        <Link href="/login" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>← Нэвтрэх</Link>
      </div>
    </>
  )
}

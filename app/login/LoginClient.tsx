'use client'
import { useState } from 'react'
import Link from 'next/link'
import NavLogo from '@/app/components/NavLogo'
import PasswordInput from '@/app/components/PasswordInput'
import { useRouter } from 'next/navigation'

export default function LoginClient({ cargoName, logoUrl, adminNext }: { cargoName?: string; logoUrl?: string; adminNext?: string }) {
  const router = useRouter()
  const [form, setForm] = useState({ phone: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [bad, setBad] = useState<'phone' | 'password' | null>(null)

  function focusField(name: 'phone' | 'password') {
    setTimeout(() => (document.querySelector(name === 'phone' ? '#login-phone' : '#login-password') as HTMLInputElement | null)?.focus(), 0)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    // Browser-ийн англи «Please fill out this field.»-ийн оронд Монгол мессеж (noValidate)
    if (!form.phone) { setBad('phone'); setError('Утасны дугаараа оруулна уу'); focusField('phone'); return }
    if (form.phone.length !== 8) { setBad('phone'); setError('Утасны дугаар 8 оронтой байна'); focusField('phone'); return }
    if (!form.password) { setBad('password'); setError('Нууц үгээ оруулна уу'); focusField('password'); return }
    setBad(null)
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    router.push(
      data.role === 'SUPER_ADMIN' ? '/super'
      : data.role === 'ADMIN' ? (adminNext ?? (data.batchMode ? '/admin/batches' : '/admin/import'))
      : data.role === 'EREEN' ? '/batch'
      : '/orders'
    )
  }

  return (
    <>
      <nav className="nav">
        <Link href="/"><NavLogo name={cargoName} logoUrl={logoUrl} /></Link>
      </nav>
      <div className="page" style={{ maxWidth: 420 }}>
        <h1 className="section-title">Нэвтрэх</h1>
        <form onSubmit={submit} noValidate>
          <div className="form-group">
            <label htmlFor="login-phone">Утасны дугаар</label>
            <input id="login-phone" className="input" type="tel" inputMode="numeric" autoComplete="tel" placeholder="99000000" required
              maxLength={8}
              value={form.phone}
              aria-invalid={bad === 'phone' || undefined} aria-describedby={error ? 'login-err' : undefined}
              onChange={e => { setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 8) }); if (bad) { setBad(null); setError('') } }} />
          </div>
          <div className="form-group">
            <label htmlFor="login-password">Нууц үг</label>
            <PasswordInput id="login-password" placeholder="••••••" required autoComplete="current-password"
              aria-invalid={bad === 'password' || undefined} aria-describedby={error ? 'login-err' : undefined}
              value={form.password} onChange={e => { setForm({ ...form, password: e.target.value }); if (bad) { setBad(null); setError('') } }} />
          </div>
          {error && <p className="msg-error" id="login-err" role="alert">{error}</p>}
          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button className="btn" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Түр хүлээнэ үү...' : 'Нэвтрэх'}
            </button>
          </div>
        </form>
        <hr className="divider" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--muted)' }}>
          <Link href="/register" className="link-tap" style={{ color: 'var(--accent)', marginLeft: -8 }}>Бүртгүүлэх</Link>
          <Link href="/forgot-password" className="link-tap" style={{ color: 'var(--muted)', marginRight: -8 }}>Нууц үг мартсан?</Link>
        </div>
      </div>
    </>
  )
}

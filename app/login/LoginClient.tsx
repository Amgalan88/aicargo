'use client'
import { useState } from 'react'
import Link from 'next/link'
import NavLogo from '@/app/components/NavLogo'
import { useRouter } from 'next/navigation'

export default function LoginClient({ cargoName, logoUrl }: { cargoName?: string; logoUrl?: string }) {
  const router = useRouter()
  const [form, setForm] = useState({ phone: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
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
    router.push(data.role === 'SUPER_ADMIN' ? '/super' : data.role === 'ADMIN' ? '/admin/import' : '/orders')
  }

  return (
    <>
      <nav className="nav">
        <Link href="/"><NavLogo name={cargoName} logoUrl={logoUrl} /></Link>
      </nav>
      <div className="page" style={{ maxWidth: 420 }}>
        <h1 className="section-title">Нэвтрэх</h1>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Утасны дугаар</label>
            <input className="input" type="tel" placeholder="99000000" required
              maxLength={8}
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 8) })} />
          </div>
          <div className="form-group">
            <label>Нууц үг</label>
            <input className="input" type="password" placeholder="••••••" required
              value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
          {error && <p className="msg-error">{error}</p>}
          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button className="btn" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Түр хүлээнэ үү...' : 'Нэвтрэх'}
            </button>
          </div>
        </form>
        <hr className="divider" />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--muted)' }}>
          <Link href="/register" style={{ color: 'var(--accent)' }}>Бүртгүүлэх</Link>
          <Link href="/forgot-password" style={{ color: 'var(--muted)' }}>Нууц үг мартсан?</Link>
        </div>
      </div>
    </>
  )
}

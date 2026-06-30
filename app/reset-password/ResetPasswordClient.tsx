'use client'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import NavLogo from '@/app/components/NavLogo'
import { useRouter, useSearchParams } from 'next/navigation'

function ResetForm({ cargoName, logoUrl }: { cargoName?: string; logoUrl?: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken: token, newPassword: password }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    router.push('/login')
  }

  return (
    <>
      <nav className="nav">
        <Link href="/"><NavLogo name={cargoName} logoUrl={logoUrl} /></Link>
      </nav>
      <div className="page" style={{ maxWidth: 420 }}>
        <h1 className="section-title">Шинэ нууц үг</h1>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Шинэ нууц үг</label>
            <input className="input" type="password" placeholder="Хамгийн багадаа 6 тэмдэгт" required
              value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <p className="msg-error">{error}</p>}
          <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: '0.5rem' }}>
            {loading ? 'Хадгалж байна...' : 'Нууц үг солих'}
          </button>
        </form>
      </div>
    </>
  )
}

export default function ResetPasswordClient({ cargoName, logoUrl }: { cargoName?: string; logoUrl?: string }) {
  return (
    <Suspense>
      <ResetForm cargoName={cargoName} logoUrl={logoUrl} />
    </Suspense>
  )
}

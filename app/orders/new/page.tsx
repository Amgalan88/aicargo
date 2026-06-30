'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import NavLogo from '@/app/components/NavLogo'

export default function NewOrderPage() {
  const [form, setForm] = useState({ trackCode: '', description: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [added, setAdded] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.trackCode.trim()) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    setAdded(prev => [data.trackCode, ...prev])
    setForm({ trackCode: '', description: '' })
    inputRef.current?.focus()
  }

  return (
    <>
      <nav className="nav">
        <Link href="/"><NavLogo /></Link>
        <div className="nav-links">
          <Link href="/orders">← Захиалга руу буцах</Link>
        </div>
      </nav>
      <div className="page" style={{ maxWidth: 480 }}>
        <h1 className="section-title">Бараа бүртгэх</h1>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Трак код</label>
            <input ref={inputRef} className="input" placeholder="жш: CX-2024-00123" required
              value={form.trackCode}
              onChange={e => setForm({ ...form, trackCode: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Тайлбар <span style={{ color: 'var(--muted)' }}>(заавал биш)</span></label>
            <textarea className="input" placeholder="Барааны тайлбар..." rows={2}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          {error && <p className="msg-error">{error}</p>}
          <button className="btn" type="submit" disabled={loading || !form.trackCode.trim()}>
            {loading ? 'Хадгалж байна...' : 'Бүртгэх'}
          </button>
        </form>

        {added.length > 0 && (
          <div style={{ marginTop: '1.5rem' }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '0.5rem' }}>
              Бүртгэгдсэн ({added.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {added.map((code, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 0.75rem', background: 'var(--surface)',
                  border: '1px solid var(--border)', borderRadius: '8px',
                  fontSize: '0.85rem',
                }}>
                  <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: '0.8rem' }}>✓</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{code}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

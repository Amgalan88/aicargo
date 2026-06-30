'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import NavLogo from '@/app/components/NavLogo'
import { useRouter, useSearchParams } from 'next/navigation'

interface Cargo { id: number; name: string; logoUrl?: string | null }

export default function RegisterClient({ cargos, lockedCargoId }: { cargos: Cargo[]; lockedCargoId?: number }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const locked = lockedCargoId ? cargos.find(c => c.id === lockedCargoId) ?? null : null
  const [selectedCargo, setSelectedCargo] = useState<Cargo | null>(locked)
  const [cargoSearch, setCargoSearch] = useState('')

  useEffect(() => {
    if (locked) return
    const cargoId = searchParams.get('cargo')
    if (cargoId) {
      const found = cargos.find(c => c.id === Number(cargoId))
      if (found) setSelectedCargo(found)
    }
  }, [cargos, searchParams, locked])
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const filteredCargos = cargoSearch.trim()
    ? cargos.filter(c => c.name.toLowerCase().includes(cargoSearch.toLowerCase()))
    : cargos

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCargo) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, cargoId: selectedCargo.id }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    router.push('/orders')
  }

  return (
    <>
      <nav className="nav">
        <Link href="/"><NavLogo name={locked?.name ?? undefined} logoUrl={locked?.logoUrl ?? undefined} /></Link>
      </nav>
      <div className="page" style={{ maxWidth: 420 }}>

        {!selectedCargo ? (
          /* ── Step 1: карго сонгох ── */
          <>
            <h1 className="section-title">Карго сонгох</h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem' }}>
              Та аль карго компанийн хэрэглэгч бэ?
            </p>
            <input
              className="input"
              placeholder="Карго хайх..."
              value={cargoSearch}
              onChange={e => setCargoSearch(e.target.value)}
              style={{ marginBottom: '0.75rem' }}
            />
            <div style={{ display: 'grid', gap: '0.6rem' }}>
              {filteredCargos.length === 0 && (
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', textAlign: 'center', padding: '1rem 0' }}>Олдсонгүй</p>
              )}
              {filteredCargos.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCargo(c)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.9rem',
                    width: '100%', padding: '0.85rem 1.1rem',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', color: 'var(--text)',
                    fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  {c.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.logoUrl} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>
                      {c.name.charAt(0)}
                    </div>
                  )}
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{c.name}</span>
                </button>
              ))}
            </div>
            <hr className="divider" />
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
              Бүртгэлтэй юу? <Link href="/login" style={{ color: 'var(--accent)' }}>Нэвтрэх</Link>
            </p>
          </>
        ) : (
          /* ── Step 2: бүртгэлийн форм ── */
          <>
            <div style={{ marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {!locked && (
                  <button
                    onClick={() => { setSelectedCargo(null); setError('') }}
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit', padding: 0 }}
                  >
                    ←
                  </button>
                )}
                <h1 className="section-title" style={{ margin: 0 }}>Бүртгүүлэх</h1>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--surface)', border: '1.5px solid var(--accent)',
                borderRadius: 'var(--radius)', padding: '0.65rem 1rem',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    {selectedCargo.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selectedCargo.logoUrl} alt="" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 5 }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: 5, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--accent)' }}>
                        {selectedCargo.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.1rem' }}>Сонгосон карго</div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{selectedCargo.name}</div>
                    </div>
                  </div>
                </div>
                {!locked && (
                  <button
                    onClick={() => { setSelectedCargo(null); setError('') }}
                    style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit' }}
                  >
                    Өөрчлөх
                  </button>
                )}
              </div>
            </div>

            <form onSubmit={submit}>
              <div className="form-group">
                <label>Нэр</label>
                <input className="input" placeholder="Нэр" required
                  value={form.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Утасны дугаар</label>
                <input className="input" type="tel" placeholder="99000000" required
                  maxLength={8} pattern="\d{8}"
                  value={form.phone}
                  onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 8))} />
              </div>
              <div className="form-group">
                <label>И-мэйл</label>
                <input className="input" type="email" placeholder="example@gmail.com" required
                  value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Нууц үг</label>
                <input className="input" type="password" placeholder="Хамгийн багадаа 6 тэмдэгт" required
                  value={form.password} onChange={e => set('password', e.target.value)} />
              </div>
              {error && <p className="msg-error">{error}</p>}
              <div className="form-actions" style={{ marginTop: '1rem' }}>
                <button className="btn" type="submit" disabled={loading} style={{ width: '100%' }}>
                  {loading ? 'Түр хүлээнэ үү...' : 'Бүртгүүлэх'}
                </button>
              </div>
            </form>
            <hr className="divider" />
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
              Бүртгэлтэй юу? <Link href="/login" style={{ color: 'var(--accent)' }}>Нэвтрэх</Link>
            </p>
          </>
        )}
      </div>
    </>
  )
}

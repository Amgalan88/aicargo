'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import NavLogo from '@/app/components/NavLogo'

const FEATURES = [
  {
    key: 'aiEnabled' as const,
    icon: '✨',
    title: 'AI Туслах',
    desc: 'Хэрэглэгч тань чатаар ачааныхаа байдал, төлбөр, ажлын цагаа асууж AI-аас шууд хариулт авна. Танд ирэх дуудлага, асуулт эрс багасна. Админ та ч мөн статистик, тайлангаа AI-аар шүүж харна.',
  },
  {
    key: 'searchByPhone' as const,
    icon: '📱',
    title: 'Утсаар ачаа шалгах',
    desc: 'Хэрэглэгч бүртгэл үүсгэлгүйгээр танай сайт дээр утасны дугаараа бичээд ирсэн ачаагаа шалгана. Бүртгэлгүй хэрэглэгчид ч үйлчилгээ авна.',
  },
  {
    key: 'notificationsEnabled' as const,
    icon: '🔔',
    title: 'Мэдэгдлийн систем',
    desc: 'Шинэ ачаа бүртгэгдэхэд танд мэдэгдэл очно. Мөн хэрэглэгчдэд ачаа ирснийг имэйлээр мэдэгдэх боломж.',
  },
]

type Form = {
  cargoName: string; slug: string
  adminName: string; phone: string; email: string; password: string
  aiEnabled: boolean; searchByPhone: boolean; notificationsEnabled: boolean
}

export default function SignupCargoClient() {
  const [step, setStep] = useState<'form' | 'otp' | 'done'>('form')
  const [form, setForm] = useState<Form>({
    cargoName: '', slug: '', adminName: '', phone: '', email: '', password: '',
    aiEnabled: true, searchByPhone: true, notificationsEnabled: true,
  })
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle')
  const [slugMsg, setSlugMsg] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [otp, setOtp] = useState('')
  const [doneSlug, setDoneSlug] = useState('')
  const [logoBase64, setLogoBase64] = useState<string | null>(null)
  const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { setError('Лого 3MB-аас бага байх ёстой'); return }
    setError('')
    const reader = new FileReader()
    reader.onload = ev => setLogoBase64(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  // Slug-ийг бодит цагт шалгана (debounce 400ms)
  useEffect(() => {
    const slug = form.slug.trim().toLowerCase()
    if (!slug) { setSlugStatus('idle'); setSlugMsg(''); return }
    setSlugStatus('checking')
    if (slugTimer.current) clearTimeout(slugTimer.current)
    slugTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/signup-cargo/check-slug?slug=${encodeURIComponent(slug)}`)
        const data = await res.json()
        if (data.available) { setSlugStatus('ok'); setSlugMsg('Боломжтой') }
        else { setSlugStatus('taken'); setSlugMsg(data.error || 'Боломжгүй') }
      } catch { setSlugStatus('idle') }
    }, 400)
    return () => { if (slugTimer.current) clearTimeout(slugTimer.current) }
  }, [form.slug])

  const canSubmit =
    form.cargoName.trim().length >= 2 &&
    slugStatus === 'ok' &&
    form.adminName.trim().length >= 2 &&
    /^\d{8}$/.test(form.phone) &&
    /^\S+@\S+\.\S+$/.test(form.email) &&
    form.password.length >= 6

  async function requestOtp() {
    if (!canSubmit || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/signup-cargo/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Алдаа гарлаа'); return }
      setStep('otp')
    } catch { setError('Холболтын алдаа гарлаа') }
    finally { setLoading(false) }
  }

  async function verify() {
    if (otp.length !== 6 || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/signup-cargo/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, code: otp, logoBase64 }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Алдаа гарлаа'); return }
      setDoneSlug(data.slug)
      setStep('done')
    } catch { setError('Холболтын алдаа гарлаа') }
    finally { setLoading(false) }
  }

  return (
    <>
      <nav className="nav">
        <Link href="/"><NavLogo /></Link>
        <div className="nav-links">
          <Link href="/login">Нэвтрэх</Link>
        </div>
      </nav>

      <div className="page" style={{ maxWidth: 480, paddingBottom: '3rem' }}>

        {step === 'form' && (
          <>
            <h1 className="section-title" style={{ marginBottom: '0.3rem' }}>Шинэ карго нээх</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              30 хоног үнэгүй туршаад үзээрэй. Хэдхэн минутад өөрийн карго хянах системтэй болно.
            </p>

            <div className="form-group">
              <label>Каргоны нэр <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input className="input" placeholder="жш: Дархан бүсийн карго"
                value={form.cargoName} onChange={e => set('cargoName', e.target.value)} />
            </div>

            <div className="form-group">
              <label>Вэб хаяг (subdomain) <span style={{ color: 'var(--danger)' }}>*</span></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input className="input" placeholder="darkhan"
                  value={form.slug}
                  onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  style={{ flex: 1 }} />
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem', flexShrink: 0 }}>.aicargo.mn</span>
              </div>
              {form.slug && (
                <p style={{
                  fontSize: '0.75rem', marginTop: '0.3rem',
                  color: slugStatus === 'ok' ? 'var(--green)' : slugStatus === 'taken' ? 'var(--danger)' : 'var(--muted)',
                }}>
                  {slugStatus === 'checking' ? 'Шалгаж байна...' :
                   slugStatus === 'ok' ? `✓ ${form.slug}.aicargo.mn — ${slugMsg}` :
                   slugStatus === 'taken' ? `✗ ${slugMsg}` : ''}
                </p>
              )}
            </div>

            <div className="form-group">
              <label>Лого <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(заавал биш — дараа нэмж болно)</span></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {logoBase64 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoBase64} alt="logo" style={{
                    width: 44, height: 44, borderRadius: 10, objectFit: 'cover',
                    border: '1px solid var(--border)', flexShrink: 0,
                  }} />
                )}
                <input type="file" accept="image/*" onChange={handleLogo} style={{ fontSize: '0.82rem' }} />
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.3rem' }}>
                Вэб хаяг, апп-ын икон болон нүүр хуудсанд харагдана
              </p>
            </div>

            <hr className="divider" />
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
              Админы бүртгэл
            </p>

            <div className="form-group">
              <label>Таны нэр <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input className="input" placeholder="Нэр"
                value={form.adminName} onChange={e => set('adminName', e.target.value)} />
            </div>

            <div className="form-group">
              <label>Утасны дугаар <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input className="input" type="tel" placeholder="99000000" maxLength={8}
                value={form.phone}
                onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 8))} />
            </div>

            <div className="form-group">
              <label>И-мэйл <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input className="input" type="email" placeholder="tanii@mail.com"
                value={form.email} onChange={e => set('email', e.target.value)} />
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.3rem' }}>
                Энэ хаяг руу баталгаажуулах код очно
              </p>
            </div>

            <div className="form-group">
              <label>Нууц үг <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input className="input" type="password" placeholder="6-аас дээш тэмдэгт"
                value={form.password} onChange={e => set('password', e.target.value)} />
            </div>

            <hr className="divider" />
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
              Нэмэлт боломжууд
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
              {FEATURES.map(f => (
                <label key={f.key} style={{
                  display: 'flex', gap: '0.7rem', alignItems: 'flex-start',
                  padding: '0.8rem 0.9rem', cursor: 'pointer',
                  background: form[f.key] ? 'var(--accent-light)' : 'var(--surface)',
                  border: `1px solid ${form[f.key] ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)', transition: 'border-color 0.12s, background 0.12s',
                }}>
                  <input type="checkbox" checked={form[f.key]}
                    onChange={e => set(f.key, e.target.checked)}
                    style={{ accentColor: 'var(--accent)', marginTop: 3, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.87rem', marginBottom: 2 }}>
                      {f.icon} {f.title}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                      {f.desc}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {error && <p className="msg-error" style={{ marginBottom: '0.75rem' }}>{error}</p>}

            <button className="btn" onClick={requestOtp} disabled={!canSubmit || loading} style={{ width: '100%' }}>
              {loading ? 'Илгээж байна...' : 'Үргэлжлүүлэх'}
            </button>
            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.75rem' }}>
              Үргэлжлүүлснээр таны и-мэйл рүү баталгаажуулах код очно
            </p>
          </>
        )}

        {step === 'otp' && (
          <>
            <h1 className="section-title" style={{ marginBottom: '0.3rem' }}>И-мэйл баталгаажуулах</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              <strong style={{ color: 'var(--text)' }}>{form.email}</strong> хаяг руу 6 оронтой код илгээлээ.
            </p>
            <div className="form-group">
              <label>Баталгаажуулах код</label>
              <input className="input" inputMode="numeric" placeholder="000000" maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => { if (e.key === 'Enter') verify() }}
                style={{ fontSize: '1.3rem', letterSpacing: '8px', textAlign: 'center', fontFamily: 'monospace' }} />
            </div>
            {error && <p className="msg-error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
            <button className="btn" onClick={verify} disabled={otp.length !== 6 || loading} style={{ width: '100%' }}>
              {loading ? 'Шалгаж байна...' : 'Баталгаажуулж карго нээх'}
            </button>
            <button onClick={() => { setStep('form'); setOtp(''); setError('') }} style={{
              width: '100%', marginTop: '0.6rem', padding: '0.6rem',
              background: 'none', border: 'none', color: 'var(--muted)',
              cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit',
            }}>
              ← Буцаж засах
            </button>
          </>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', paddingTop: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
            <h1 className="section-title" style={{ marginBottom: '0.5rem' }}>Амжилттай нээгдлээ!</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginBottom: '0.5rem' }}>
              Таны карго хянах систем бэлэн боллоо:
            </p>
            <p style={{ marginBottom: '1.5rem' }}>
              <a href={`https://${doneSlug}.aicargo.mn/admin/import`} style={{
                color: 'var(--accent)', fontWeight: 700, fontSize: '1.05rem',
              }}>
                {doneSlug}.aicargo.mn
              </a>
            </p>
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              30 хоногийн үнэгүй туршилт эхэллээ.<br />
              Тохиргоо хэсгээс Эрээний хаяг, тариф, банкны мэдээллээ бөглөөрэй.
            </p>
            <a href={`https://${doneSlug}.aicargo.mn/admin/settings`} className="btn" style={{ textDecoration: 'none' }}>
              Тохиргоо хийх →
            </a>
          </div>
        )}
      </div>
    </>
  )
}

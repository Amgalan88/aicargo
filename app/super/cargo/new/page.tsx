'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewCargoPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '', slug: '', ereemReceiver: '', ereemPhone: '', ereemRegion: '', ereemAddress: '',
    adminName: '', adminPhone: '', adminPassword: '',
  })
  const [logoUrl, setLogoUrl] = useState('')
  const [logoPreview, setLogoPreview] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const result = ev.target?.result as string
      setLogoUrl(result)
      setLogoPreview(result)
    }
    reader.readAsDataURL(file)
  }

  // Auto-generate slug from cargo name
  function handleName(v: string) {
    setForm(f => ({
      ...f,
      name: v,
      slug: f.slug === '' || f.slug === toSlug(f.name) ? toSlug(v) : f.slug,
    }))
  }
  function toSlug(s: string) {
    return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/super/cargo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, logoUrl }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    router.push('/super')
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <Link href="/super" style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>← Буцах</Link>
        <h1 className="section-title" style={{ margin: 0 }}>Шинэ карго нэмэх</h1>
      </div>

      <div style={{ maxWidth: 540 }}>
        <form onSubmit={submit}>

          {/* Cargo info */}
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.8rem' }}>Карго мэдээлэл</p>

          <div className="form-group">
            <label>Лого (заавал биш)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {logoPreview && (
                <img src={logoPreview} alt="preview" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border)' }} />
              )}
              <input type="file" accept="image/*" onChange={handleLogo}
                style={{ fontSize: '0.85rem', color: 'var(--muted)' }} />
            </div>
          </div>

          <div className="form-group">
            <label>Карго нэр</label>
            <input className="input" placeholder="Стар карго" required
              value={form.name} onChange={e => handleName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Slug</label>
            <input className="input" placeholder="star" required
              value={form.slug} onChange={e => set('slug', e.target.value)} />
            <small style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Жижиг латин үсэг, тоо, зураас — URL-д ашиглагдана</small>
          </div>

          {/* Ereen address */}
          <div style={{ borderTop: '1px solid var(--border)', margin: '1.2rem 0 0.8rem', paddingTop: '1rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.8rem' }}>Эрээний хаяг</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 0.75rem' }}>
            <div className="form-group">
              <label>收货人 (Хүлээн авагч)</label>
              <input className="input" placeholder="Нэр + утас" required
                value={form.ereemReceiver} onChange={e => set('ereemReceiver', e.target.value)} />
            </div>
            <div className="form-group">
              <label>手机号 (Утасны дугаар)</label>
              <input className="input" placeholder="18600000000" required
                value={form.ereemPhone} onChange={e => set('ereemPhone', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>地区 (Муж/Хот/Дүүрэг)</label>
            <input className="input" placeholder="内蒙古·二连浩特市" required
              value={form.ereemRegion} onChange={e => set('ereemRegion', e.target.value)} />
          </div>
          <div className="form-group">
            <label>详细地址 (Дэлгэрэнгүй хаяг)</label>
            <input className="input" placeholder="环宇商贸城9栋24号..." required
              value={form.ereemAddress} onChange={e => set('ereemAddress', e.target.value)} />
          </div>

          {/* Admin user */}
          <div style={{ borderTop: '1px solid var(--border)', margin: '1.2rem 0 0.8rem', paddingTop: '1rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.8rem' }}>Админ бүртгэл</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 0.75rem' }}>
            <div className="form-group">
              <label>Нэр</label>
              <input className="input" placeholder="Овог Нэр" required
                value={form.adminName} onChange={e => set('adminName', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Утас</label>
              <input className="input" placeholder="99000000" required
                value={form.adminPhone} onChange={e => set('adminPhone', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Нууц үг</label>
            <input className="input" type="password" placeholder="Хамгийн багадаа 6 тэмдэгт" required minLength={6}
              value={form.adminPassword} onChange={e => set('adminPassword', e.target.value)} />
          </div>

          {error && <p className="msg-error">{error}</p>}

          <div className="form-actions" style={{ marginTop: '1.5rem' }}>
            <button className="btn" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Үүсгэж байна...' : 'Карго + Админ үүсгэх'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

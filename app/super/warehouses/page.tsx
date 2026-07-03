'use client'
import { useState, useEffect, useRef } from 'react'

interface Warehouse {
  id: number
  name: string
  description: string | null
  phone: string | null
  wechat: string | null
  address: string | null
  imageUrl: string | null
  order: number
  active: boolean
}

interface Form {
  name: string; description: string; phone: string
  wechat: string; address: string; order: string
}
const EMPTY: Form = { name: '', description: '', phone: '', wechat: '', address: '', order: '0' }

export default function WarehousesPage() {
  const [list, setList] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Form>(EMPTY)
  const [editId, setEditId] = useState<number | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function load() {
    fetch('/api/super/warehouses')
      .then(r => r.json())
      .then(data => { setList(data); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  function set(k: keyof Form, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('Зураг 5MB-аас бага байх ёстой'); return }
    const reader = new FileReader()
    reader.onload = ev => {
      const b64 = ev.target?.result as string
      setImageBase64(b64)
      setImagePreview(b64)
    }
    reader.readAsDataURL(file)
  }

  function startEdit(w: Warehouse) {
    setEditId(w.id)
    setForm({
      name: w.name, description: w.description ?? '', phone: w.phone ?? '',
      wechat: w.wechat ?? '', address: w.address ?? '', order: String(w.order),
    })
    setImageBase64(null)
    setImagePreview(w.imageUrl)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function reset() {
    setEditId(null)
    setForm(EMPTY)
    setImageBase64(null)
    setImagePreview(null)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function save() {
    if (!form.name.trim()) { setError('Нэр оруулна уу'); return }
    setSaving(true)
    setError('')
    const body: any = { ...form, imageBase64 }
    if (editId) body.id = editId
    const res = await fetch('/api/super/warehouses', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Алдаа гарлаа')
      return
    }
    reset()
    load()
  }

  async function toggleActive(w: Warehouse) {
    await fetch('/api/super/warehouses', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: w.id, active: !w.active }),
    })
    load()
  }

  async function remove(id: number) {
    if (!confirm('Энэ агуулахыг устгах уу?')) return
    await fetch('/api/super/warehouses', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  return (
    <div className="page-wide" style={{ maxWidth: 760 }}>
      <h1 className="section-title">Эрээний түншлэгч агуулахууд</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.83rem', marginBottom: '1.25rem' }}>
        Эдгээр агуулах aicargo.mn-ийн нүүр хуудсанд харагдана.
      </p>

      {/* Form */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '0.92rem', fontWeight: 700, margin: '0 0 1rem' }}>
          {editId ? `Засах — ${form.name}` : '+ Шинэ агуулах нэмэх'}
        </h2>
        <div className="admin-form-2col">
          <div className="form-group" style={{ margin: 0 }}>
            <label>Нэр <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="input" placeholder="жш: Эрээн Хуа Жиан агуулах"
              value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Эрэмбэ</label>
            <input className="input" type="number" value={form.order}
              onChange={e => set('order', e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Утас</label>
            <input className="input" placeholder="+86 ..." value={form.phone}
              onChange={e => set('phone', e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>WeChat</label>
            <input className="input" placeholder="WeChat ID" value={form.wechat}
              onChange={e => set('wechat', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ marginTop: '0.75rem' }}>
          <label>Хаяг</label>
          <input className="input" placeholder="Эрээн хот, ..." value={form.address}
            onChange={e => set('address', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Тайлбар</label>
          <textarea className="input" rows={2} placeholder="Товч танилцуулга..."
            value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Зураг</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImage}
            style={{ fontSize: '0.82rem' }} />
          {imagePreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePreview} alt="preview" style={{
              marginTop: '0.5rem', width: 200, height: 125, objectFit: 'cover',
              borderRadius: 8, border: '1px solid var(--border)',
            }} />
          )}
        </div>
        {error && <p className="msg-error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? 'Хадгалж байна...' : editId ? 'Хадгалах' : 'Нэмэх'}
          </button>
          {editId && (
            <button className="btn-ghost" onClick={reset}>Болих</button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>
      ) : list.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Агуулах бүртгэгдээгүй байна.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {list.map(w => (
            <div key={w.id} className="card" style={{
              padding: '0.9rem 1.1rem', display: 'flex', gap: '0.9rem',
              alignItems: 'flex-start', opacity: w.active ? 1 : 0.55,
            }}>
              {w.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.imageUrl} alt={w.name} style={{
                  width: 96, height: 60, objectFit: 'cover', borderRadius: 8,
                  border: '1px solid var(--border)', flexShrink: 0,
                }} />
              ) : (
                <div style={{
                  width: 96, height: 60, borderRadius: 8, background: 'var(--surface2)',
                  border: '1px solid var(--border)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.3rem',
                }}>🏭</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                  {w.name}
                  {!w.active && <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginLeft: 6 }}>(идэвхгүй)</span>}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
                  {[w.phone, w.wechat && `WeChat: ${w.wechat}`, w.address].filter(Boolean).join(' · ') || '—'}
                </div>
                {w.description && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {w.description}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                <button onClick={() => toggleActive(w)} title={w.active ? 'Нуух' : 'Идэвхжүүлэх'} style={iconBtn}>
                  {w.active ? '👁' : '🚫'}
                </button>
                <button onClick={() => startEdit(w)} title="Засах" style={iconBtn}>✏️</button>
                <button onClick={() => remove(w.id)} title="Устгах" style={{ ...iconBtn, color: 'var(--danger)' }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', cursor: 'pointer',
  padding: '0.3rem 0.5rem', borderRadius: 6, fontSize: '0.85rem', lineHeight: 1,
}

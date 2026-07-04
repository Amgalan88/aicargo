'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Admin { id: number; name: string; phone: string }
interface CargoStat {
  id: number
  name: string
  slug: string
  ereemReceiver: string
  ereemPhone: string
  ereemRegion: string
  ereemAddress: string
  logoUrl: string | null
  bankName: string | null
  bankAccountHolder: string | null
  bankAccountNumber: string | null
  bankTransferNote: string | null
  notificationsEnabled: boolean
  searchByPhone: boolean
  batchEnabled: boolean
  paidUntil: string | null
  createdAt: string
  admins: Admin[]
  totalUsers: number
  totalShipments: number
}

function paidUntilColor(paidUntil: string | null): string {
  if (!paidUntil) return 'var(--muted)'
  const days = Math.floor((new Date(paidUntil).getTime() - Date.now()) / 86400000)
  if (days < 0) return '#ef4444'
  if (days < 7) return '#f97316'
  if (days < 30) return '#eab308'
  return '#22c55e'
}

function paidUntilLabel(paidUntil: string | null): string {
  if (!paidUntil) return ''
  const d = new Date(paidUntil)
  const days = Math.floor((d.getTime() - Date.now()) / 86400000)
  const label = `${d.getMonth() + 1}/${d.getDate()}`
  if (days < 0) return `⛔ Дууссан (${label})`
  if (days === 0) return `⚠ Өнөөдөр дуусна`
  if (days < 30) return `⚠ ${label} хүртэл (${days}хоног)`
  return `✓ ${label} хүртэл`
}

type Category = 'NEW' | 'PAID' | 'UNPAID' | 'INACTIVE' | 'UNSET'

const CATEGORIES: { key: Category | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Бүгд' },
  { key: 'NEW', label: '🆕 Шинэ (туршилт)' },
  { key: 'PAID', label: '✓ Төлсөн' },
  { key: 'UNPAID', label: '⚠ Төлөөгүй' },
  { key: 'INACTIVE', label: '⛔ Идэвхгүй' },
  { key: 'UNSET', label: 'Тохируулаагүй' },
]

function categorize(c: CargoStat): Category {
  const now = Date.now()
  const isNew = now - new Date(c.createdAt).getTime() < 30 * 86400000
  if (!c.paidUntil) return isNew ? 'NEW' : 'UNSET'
  const paid = new Date(c.paidUntil).getTime()
  if (paid >= now) return isNew ? 'NEW' : 'PAID'
  const overdueDays = (now - paid) / 86400000
  return overdueDays >= 40 ? 'INACTIVE' : 'UNPAID'
}

interface EditState {
  name: string
  slug: string
  ereemReceiver: string
  ereemPhone: string
  ereemRegion: string
  ereemAddress: string
  logoUrl: string
  bankName: string
  bankAccountHolder: string
  bankAccountNumber: string
  bankTransferNote: string
}

export default function SuperPage() {
  const [cargos, setCargos] = useState<CargoStat[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditState>({ name: '', slug: '', ereemReceiver: '', ereemPhone: '', ereemRegion: '', ereemAddress: '', logoUrl: '', bankName: '', bankAccountHolder: '', bankAccountNumber: '', bankTransferNote: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [pwModal, setPwModal] = useState<{ userId: number; name: string } | null>(null)
  const [pwInput, setPwInput] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
  const [paidDates, setPaidDates] = useState<Record<number, string>>({})
  const [paidSaving, setPaidSaving] = useState(false)
  const [paidMsg, setPaidMsg] = useState('')
  const [catFilter, setCatFilter] = useState<Category | 'ALL'>('ALL')

  const catCounts = cargos.reduce<Record<string, number>>((acc, c) => {
    const cat = categorize(c)
    acc[cat] = (acc[cat] ?? 0) + 1
    return acc
  }, {})
  const filtered = catFilter === 'ALL' ? cargos : cargos.filter(c => categorize(c) === catFilter)

  async function resetPassword() {
    if (!pwModal || pwInput.length < 6) return
    setPwLoading(true)
    const res = await fetch('/api/super/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: pwModal.userId, newPassword: pwInput }),
    })
    setPwLoading(false)
    if (res.ok) { setPwMsg('✓ Нууц үг шинэчлэгдлээ'); setPwInput('') }
    else { const d = await res.json(); setPwMsg(d.error || 'Алдаа гарлаа') }
  }
  function load() {
    setLoading(true)
    fetch('/api/super/cargos')
      .then(r => r.json())
      .then(data => {
        setCargos(data)
        setLoading(false)
        const init: Record<number, string> = {}
        for (const c of data) init[c.id] = c.paidUntil ? c.paidUntil.slice(0, 10) : ''
        setPaidDates(init)
      })
      .catch(() => setLoading(false))
  }

  async function saveAllPaid() {
    setPaidSaving(true)
    setPaidMsg('')
    await Promise.all(
      Object.entries(paidDates).map(([id, date]) =>
        fetch(`/api/super/cargo/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paidUntil: date || null }),
        })
      )
    )
    setPaidSaving(false)
    setPaidMsg('✓ Хадгалагдлаа')
    setTimeout(() => setPaidMsg(''), 2500)
    load()
  }

  useEffect(() => { load() }, [])

  function startEdit(c: CargoStat) {
    setEditId(c.id)
    setEditForm({ name: c.name, slug: c.slug, ereemReceiver: c.ereemReceiver, ereemPhone: c.ereemPhone, ereemRegion: c.ereemRegion ?? '', ereemAddress: c.ereemAddress, logoUrl: c.logoUrl ?? '', bankName: c.bankName ?? '', bankAccountHolder: c.bankAccountHolder ?? '', bankAccountNumber: c.bankAccountNumber ?? '', bankTransferNote: c.bankTransferNote ?? '' })
    setEditError('')
  }

  async function saveEdit(id: number) {
    setEditLoading(true)
    setEditError('')
    const res = await fetch(`/api/super/cargo/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    const data = await res.json()
    setEditLoading(false)
    if (!res.ok) { setEditError(data.error); return }
    setEditId(null)
    load()
  }

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 className="section-title" style={{ margin: 0 }}>Карго компаниуд ({cargos.length})</h1>
        <Link href="/super/cargo/new" className="btn" style={{ fontSize: '0.85rem', padding: '0.5rem 1.2rem' }}>
          + Шинэ карго
        </Link>
      </div>

      {/* Ангиллын табууд */}
      {!loading && cargos.length > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          {CATEGORIES.map(cat => {
            const count = cat.key === 'ALL' ? cargos.length : (catCounts[cat.key] ?? 0)
            if (cat.key !== 'ALL' && count === 0) return null
            const active = catFilter === cat.key
            return (
              <button key={cat.key} onClick={() => setCatFilter(cat.key)} style={{
                padding: '0.35rem 0.85rem', borderRadius: '100px', border: '1px solid',
                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                background: active ? 'var(--accent)' : 'var(--surface)',
                color: active ? '#fff' : 'var(--muted)',
              }}>
                {cat.label} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* Paid until bulk editor */}
      {!loading && filtered.length > 0 && (
        <div className="card" style={{ padding: '1.2rem 1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '0.88rem', fontWeight: 700, margin: 0, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Вэбийн төлбөр хүртэлх огноо</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {paidMsg && <span style={{ fontSize: '0.82rem', color: '#22c55e' }}>{paidMsg}</span>}
              <button className="btn" onClick={saveAllPaid} disabled={paidSaving} style={{ fontSize: '0.82rem', padding: '0.4rem 1.2rem' }}>
                {paidSaving ? 'Хадгалж...' : 'Хадгалах'}
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.6rem' }}>
            {filtered.map(c => (
              <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.6rem 0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{c.name}</span>
                  {paidDates[c.id] && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: paidUntilColor(paidDates[c.id] ? new Date(paidDates[c.id]).toISOString() : null) }}>
                      {paidUntilLabel(paidDates[c.id] ? new Date(paidDates[c.id]).toISOString() : null)}
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  value={paidDates[c.id] ?? ''}
                  onChange={e => setPaidDates(prev => ({ ...prev, [c.id]: e.target.value }))}
                  style={{ fontSize: '0.82rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.3rem 0.5rem', color: 'var(--text)', fontFamily: 'inherit', width: '100%' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cargo cards */}
      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {filtered.map(c => (
            <div key={c.id} className="card" style={{ padding: '1.3rem 1.5rem' }}>
              {editId === c.id ? (
                /* ── Edit mode ── */
                <div>
                  {/* Logo upload */}
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.4rem' }}>Лого</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {editForm.logoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={editForm.logoUrl} alt="logo" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--border)' }} />
                      )}
                      <input type="file" accept="image/*" style={{ fontSize: '0.82rem' }}
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const img = new Image()
                          const url = URL.createObjectURL(file)
                          img.onload = () => {
                            const MAX = 400
                            const scale = Math.min(MAX / img.width, MAX / img.height, 1)
                            const w = Math.round(img.width * scale)
                            const h = Math.round(img.height * scale)
                            const canvas = document.createElement('canvas')
                            canvas.width = w
                            canvas.height = h
                            const ctx = canvas.getContext('2d')!
                            ctx.drawImage(img, 0, 0, w, h)
                            setEditForm(f => ({ ...f, logoUrl: canvas.toDataURL('image/png', 1) }))
                            URL.revokeObjectURL(url)
                          }
                          img.src = url
                        }} />
                      {editForm.logoUrl && (
                        <button onClick={() => setEditForm(f => ({ ...f, logoUrl: '' }))}
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.78rem' }}>
                          Устгах
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>Нэр</label>
                      <input className="input" value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>
                        Slug <span style={{ color: 'var(--danger)', fontWeight: 400 }}>⚠ subdomain өөрчлөгдөнө</span>
                      </label>
                      <input className="input" value={editForm.slug}
                        onChange={e => setEditForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>收货人</label>
                      <input className="input" value={editForm.ereemReceiver}
                        onChange={e => setEditForm(f => ({ ...f, ereemReceiver: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>手机号</label>
                      <input className="input" value={editForm.ereemPhone}
                        onChange={e => setEditForm(f => ({ ...f, ereemPhone: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>地区</label>
                      <input className="input" placeholder="内蒙古·二连浩特市" value={editForm.ereemRegion}
                        onChange={e => setEditForm(f => ({ ...f, ereemRegion: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: '0.75rem' }}>详细地址</label>
                      <input className="input" value={editForm.ereemAddress}
                        onChange={e => setEditForm(f => ({ ...f, ereemAddress: e.target.value }))} />
                    </div>
                  </div>

                  {/* Bank fields */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>Төлбөр төлөх данс</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.75rem' }}>Банкны нэр</label>
                        <input className="input" placeholder="Хаан банк" value={editForm.bankName}
                          onChange={e => setEditForm(f => ({ ...f, bankName: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.75rem' }}>Хүлээн авагчийн нэр</label>
                        <input className="input" placeholder="Овог Нэр" value={editForm.bankAccountHolder}
                          onChange={e => setEditForm(f => ({ ...f, bankAccountHolder: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.75rem' }}>Дансны дугаар</label>
                        <input className="input" placeholder="5000123456" value={editForm.bankAccountNumber}
                          onChange={e => setEditForm(f => ({ ...f, bankAccountNumber: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.75rem' }}>Гүйлгээний утга</label>
                        <input className="input" placeholder="Утасны дугаараа заавал бичнэ үү" value={editForm.bankTransferNote}
                          onChange={e => setEditForm(f => ({ ...f, bankTransferNote: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                  {editError && <p className="msg-error" style={{ margin: '0 0 0.5rem' }}>{editError}</p>}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn" onClick={() => saveEdit(c.id)} disabled={editLoading} style={{ fontSize: '0.82rem', padding: '0.4rem 1rem' }}>
                      {editLoading ? 'Хадгалж...' : 'Хадгалах'}
                    </button>
                    <button onClick={() => setEditId(null)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 'var(--radius)', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.82rem' }}>
                      Болих
                    </button>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <div>
                  {/* Top row: name + slug + edit button */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <strong style={{ fontSize: '1rem' }}>{c.name}</strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'monospace', background: 'var(--surface2,#1a1a1a)', padding: '0.1rem 0.5rem', borderRadius: 4 }}>
                        {c.slug}
                      </span>
                      {c.admins.length === 0 && (
                        <span style={{ fontSize: '0.72rem', color: '#f97316', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 4, padding: '0.1rem 0.5rem' }}>
                          Админгүй
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        onClick={async () => {
                          await fetch(`/api/super/cargo/${c.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ notificationsEnabled: !c.notificationsEnabled }),
                          })
                          load()
                        }}
                        style={{
                          background: c.notificationsEnabled ? 'rgba(34,197,94,0.12)' : 'none',
                          border: `1px solid ${c.notificationsEnabled ? '#22c55e' : 'var(--border)'}`,
                          color: c.notificationsEnabled ? '#22c55e' : 'var(--muted)',
                          borderRadius: 'var(--radius)', padding: '0.3rem 0.8rem',
                          cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap', fontFamily: 'inherit',
                        }}
                      >
                        {c.notificationsEnabled ? '🔔 Мэдэгдэл: Тийм' : '🔕 Мэдэгдэл: Үгүй'}
                      </button>
                      <button
                        onClick={async () => {
                          await fetch(`/api/super/cargo/${c.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ searchByPhone: !c.searchByPhone }),
                          })
                          load()
                        }}
                        style={{
                          background: c.searchByPhone ? 'rgba(99,102,241,0.12)' : 'none',
                          border: `1px solid ${c.searchByPhone ? '#6366f1' : 'var(--border)'}`,
                          color: c.searchByPhone ? '#6366f1' : 'var(--muted)',
                          borderRadius: 'var(--radius)', padding: '0.3rem 0.8rem',
                          cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap', fontFamily: 'inherit',
                        }}
                      >
                        {c.searchByPhone ? '📱 Утас хайлт: Тийм' : '📱 Утас хайлт: Үгүй'}
                      </button>
                      <button
                        onClick={async () => {
                          await fetch(`/api/super/cargo/${c.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ batchEnabled: !c.batchEnabled }),
                          })
                          load()
                        }}
                        style={{
                          background: c.batchEnabled ? 'rgba(201,100,66,0.12)' : 'none',
                          border: `1px solid ${c.batchEnabled ? 'var(--accent)' : 'var(--border)'}`,
                          color: c.batchEnabled ? 'var(--accent)' : 'var(--muted)',
                          borderRadius: 'var(--radius)', padding: '0.3rem 0.8rem',
                          cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap', fontFamily: 'inherit',
                        }}
                      >
                        {c.batchEnabled ? '📦 Багц: Тийм' : '📦 Багц: Үгүй'}
                      </button>
                      <button onClick={() => startEdit(c)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 'var(--radius)', padding: '0.3rem 0.8rem', cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        Засах
                      </button>
                    </div>
                  </div>

                  {/* Stats + Admins row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      {c.admins.length > 0 ? (
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          {c.admins.map(a => (
                            <span key={a.id} style={{ fontSize: '0.82rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              {a.name} <span style={{ color: 'var(--muted)', fontFamily: 'monospace' }}>{a.phone}</span>
                              <button onClick={() => { setPwModal({ userId: a.id, name: a.name }); setPwInput(''); setPwMsg('') }} title="Нууц үг солих" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '0.1rem 0.3rem', color: 'var(--muted)' }}>🔑</button>
                            </span>
                          ))}
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>— Админ</span>
                        </div>
                      ) : (
                        <Link href="/super/assign-admin" style={{ fontSize: '0.82rem', color: 'var(--accent)' }}>
                          + Админ томилох
                        </Link>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '1.2rem', flexShrink: 0, alignItems: 'center' }}>
                      {c.paidUntil && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: paidUntilColor(c.paidUntil), whiteSpace: 'nowrap' }}>
                          {paidUntilLabel(c.paidUntil)}
                        </span>
                      )}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{c.totalUsers}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '0.15rem' }}>хэрэглэгч</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{c.totalShipments}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '0.15rem' }}>ачаа</div>
                      </div>
                    </div>
                  </div>

                  {/* Ereen address */}
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.7, borderTop: '1px solid var(--border)', paddingTop: '0.7rem' }}>
                    <span style={{ marginRight: '1.2rem' }}>收货人: <span style={{ color: 'var(--text)' }}>{c.ereemReceiver}</span></span>
                    <span style={{ marginRight: '1.2rem' }}>手机号: <span style={{ color: 'var(--text)' }}>{c.ereemPhone}</span></span>
                    {c.ereemRegion && <span style={{ marginRight: '1.2rem' }}>地区: <span style={{ color: 'var(--text)' }}>{c.ereemRegion}</span></span>}
                    <span>详细地址: <span style={{ color: 'var(--text)' }}>{c.ereemAddress}</span></span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pwModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: 360, padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', fontWeight: 700 }}>Нууц үг солих — {pwModal.name}</h3>
            <div className="form-group">
              <label>Шинэ нууц үг <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>(хамгийн багадаа 6 тэмдэгт)</span></label>
              <input
                className="input"
                type="password"
                placeholder="Шинэ нууц үг"
                value={pwInput}
                onChange={e => { setPwInput(e.target.value); setPwMsg('') }}
                autoFocus
              />
            </div>
            {pwMsg && <p style={{ fontSize: '0.82rem', color: pwMsg.startsWith('✓') ? 'var(--green)' : 'var(--danger)', marginBottom: '0.75rem' }}>{pwMsg}</p>}
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button className="btn" onClick={resetPassword} disabled={pwInput.length < 6 || pwLoading} style={{ flex: 1 }}>
                {pwLoading ? '...' : 'Хадгалах'}
              </button>
              <button onClick={() => setPwModal(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem' }}>
                Болих
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

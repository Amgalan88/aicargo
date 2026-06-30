'use client'
import { useState, useEffect } from 'react'

export default function SettingsPage() {
  const [form, setForm] = useState({ tariff: '', announcement: '', contactInfo: '', bankName: '', bankAccountHolder: '', bankAccountNumber: '', bankTransferNote: '', arrivedLabel: '', ereemLabel: '' })
  const [cargo, setCargo] = useState<{ name: string; ereemReceiver: string; ereemPhone: string; ereemRegion: string; ereemAddress: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(d => {
        setCargo(d)
        setForm({ tariff: d.tariff ?? '', announcement: d.announcement ?? '', contactInfo: d.contactInfo ?? '', bankName: d.bankName ?? '', bankAccountHolder: d.bankAccountHolder ?? '', bankAccountNumber: d.bankAccountNumber ?? '', bankTransferNote: d.bankTransferNote ?? '', arrivedLabel: d.arrivedLabel ?? '', ereemLabel: d.ereemLabel ?? '' })
        setLoading(false)
      })
  }, [])

  async function save() {
    setSaving(true)
    setSaved(false)
    await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>

  return (
    <>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="section-title" style={{ margin: 0 }}>Тохиргоо</h1>
        {cargo && <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.3rem' }}>{cargo.name}</p>}
      </div>

      {/* Ereen address (read-only, managed by super admin) */}
      <div className="card" style={{ padding: '1.1rem 1.25rem', marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>Эрээний хаяг (super admin тохируулна)</p>
        <div style={{ fontSize: '0.85rem', lineHeight: 2, color: 'var(--text)' }}>
          <div>收货人: <strong>{cargo?.ereemReceiver}</strong></div>
          <div>手机号: <strong>{cargo?.ereemPhone}</strong></div>
          {cargo?.ereemRegion && <div>地区: <strong>{cargo.ereemRegion}</strong></div>}
          <div>地址: <strong>{cargo?.ereemAddress}</strong></div>
        </div>
      </div>

      {/* Editable fields */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>Нүүр хуудасны мэдээлэл</p>

        <div className="form-group">
          <label>"Эрээнд ирсэн" төлөвийн нэр <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(хоосон бол "Эрээнд ирсэн" гэж харагдана)</span></label>
          <input
            className="input"
            placeholder="Эрээнээс ачигдсан"
            value={form.ereemLabel}
            onChange={e => setForm(f => ({ ...f, ereemLabel: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label>"Ирсэн" төлөвийн нэр <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(хоосон бол "Ирсэн" гэж харагдана)</span></label>
          <input
            className="input"
            placeholder="Булганд ирсэн"
            value={form.arrivedLabel}
            onChange={e => setForm(f => ({ ...f, arrivedLabel: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label>Тариф <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(кг үнэ, дүрэм гэх мэт)</span></label>
          <textarea
            className="input"
            rows={5}
            placeholder={"1кг — ₮8,500\n5кг дээш — ₮8,000\nХажуугийн хэмжээ хязгаар: 1м"}
            value={form.tariff}
            onChange={e => setForm(f => ({ ...f, tariff: e.target.value }))}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <div className="form-group">
          <label>Анхааруулга <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(чухал мэдэгдэл)</span></label>
          <textarea
            className="input"
            rows={3}
            placeholder="Баяр наадмын үеэр ачаа хүлээн авахгүй..."
            value={form.announcement}
            onChange={e => setForm(f => ({ ...f, announcement: e.target.value }))}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <div className="form-group">
          <label>Холбоо барих <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(утас, цаг, хаяг)</span></label>
          <textarea
            className="input"
            rows={3}
            placeholder={"Утас: 99001122\nЦаг: Д-Б 09:00–18:00\nДархан, 3-р хороо"}
            value={form.contactInfo}
            onChange={e => setForm(f => ({ ...f, contactInfo: e.target.value }))}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.25rem 0' }} />
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>Төлбөр төлөх данс</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Банкны нэр</label>
            <input className="input" placeholder="Хаан банк" value={form.bankName}
              onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Хүлээн авагчийн нэр</label>
            <input className="input" placeholder="Овог Нэр" value={form.bankAccountHolder}
              onChange={e => setForm(f => ({ ...f, bankAccountHolder: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Дансны дугаар</label>
            <input className="input" placeholder="5000123456" value={form.bankAccountNumber}
              onChange={e => setForm(f => ({ ...f, bankAccountNumber: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Гүйлгээний утга <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(зааварчилгаа)</span></label>
            <input className="input" placeholder="Утасны дугаараа заавал бичнэ үү" value={form.bankTransferNote}
              onChange={e => setForm(f => ({ ...f, bankTransferNote: e.target.value }))} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? 'Хадгалж байна...' : 'Хадгалах'}
          </button>
          {saved && <span style={{ fontSize: '0.82rem', color: 'var(--green)' }}>✓ Хадгалагдлаа</span>}
        </div>
      </div>
    </>
  )
}

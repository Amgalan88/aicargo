'use client'
import { useState, useEffect } from 'react'

interface Faq { id: number; question: string; answer: string; order: number }

export default function FaqPage() {
  const [faqs, setFaqs] = useState<Faq[]>([])
  const [q, setQ] = useState('')
  const [a, setA] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)

  async function load() {
    const res = await fetch('/api/admin/faq')
    if (res.ok) setFaqs(await res.json())
  }

  useEffect(() => { load() }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim() || !a.trim()) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/admin/faq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, answer: a }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json(); setError(d.error); return }
    setQ(''); setA('')
    load()
  }

  async function del(id: number) {
    if (!confirm('Устгах уу?')) return
    setDeleting(id)
    await fetch('/api/admin/faq', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setDeleting(null)
    load()
  }

  return (
    <div className="page" style={{ maxWidth: 600 }}>
      <h1 className="section-title">FAQ удирдах</h1>

      <form onSubmit={add} noValidate>
        <div className="form-group">
          <label>Асуулт <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input className="input" placeholder="Хэрэглэгч ихэвчлэн асуудаг зүйл..."
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Хариулт <span style={{ color: 'var(--danger)' }}>*</span></label>
          <textarea className="input" placeholder="Дэлгэрэнгүй хариулт..." rows={3}
            value={a} onChange={e => setA(e.target.value)} />
        </div>
        {error && <p className="msg-error">{error}</p>}
        <button className="btn" type="submit" disabled={saving || !q.trim() || !a.trim()}
          style={{ opacity: q.trim() && a.trim() ? 1 : 0.5 }}>
          {saving ? 'Нэмж байна...' : '+ Нэмэх'}
        </button>
      </form>

      {faqs.length > 0 && (
        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {faqs.map(f => (
            <div key={f.id} className="card" style={{ padding: '0.85rem 1rem', display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.3rem' }}>{f.question}</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>{f.answer}</p>
              </div>
              <button onClick={() => del(f.id)} disabled={deleting === f.id} title="Устгах" style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
                fontSize: '0.85rem', padding: '0.1rem 0.25rem', borderRadius: '4px', flexShrink: 0,
                opacity: deleting === f.id ? 0.4 : 1,
              }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
              >🗑</button>
            </div>
          ))}
        </div>
      )}

      {faqs.length === 0 && (
        <div className="empty" style={{ marginTop: '1.5rem' }}>
          <p>FAQ байхгүй байна. Дээрх маягтаас нэмнэ үү.</p>
        </div>
      )}
    </div>
  )
}

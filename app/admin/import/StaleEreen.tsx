'use client'
import { useState } from 'react'

interface StaleItem {
  id: number
  trackCode: string
  phone: string | null
  name: string | null
  description: string | null
  since: string
  sinceApprox: boolean
  days: number
}

// Эрээнд ирсэн төлөвт хамгийн удаан байгаа ачааг олж, сонгож устгах хэсэг
export default function StaleEreen({ label, onDeleted }: { label: string; onDeleted: () => void }) {
  const [limit, setLimit] = useState('20')
  const [items, setItems] = useState<StaleItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState('')

  async function load(e?: React.FormEvent) {
    e?.preventDefault()
    setLoading(true)
    setMsg('')
    const res = await fetch(`/api/admin/ereen/stale?limit=${encodeURIComponent(limit || '20')}`)
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setMsg(data.error || 'Алдаа гарлаа'); return }
    setItems(data.items)
    setTotal(data.total)
    setSelected(new Set())
  }

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allChecked = !!items?.length && selected.size === items.length
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(items?.map(i => i.id)))
  }

  async function remove() {
    if (!selected.size) return
    if (!confirm(`Сонгосон ${selected.size} ачааг бүрмөсөн устгах уу? Энэ үйлдлийг буцааж болохгүй.`)) return
    setDeleting(true)
    const res = await fetch('/api/admin/ereen/stale', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected] }),
    })
    const data = await res.json().catch(() => ({}))
    setDeleting(false)
    if (!res.ok) {
      // Сүлжээний алдааны үед устсан эсэх нь тодорхойгүй — жагсаалтыг шинэчилж бодит төлөвийг харуулна
      await load()
      setMsg(`${data.error || 'Алдаа гарлаа'}. Жагсаалтыг шинэчиллээ — устсан эсэхийг шалгана уу.`)
      onDeleted()
      return
    }
    await load()
    setMsg(`✓ ${data.count} ачаа устгагдлаа${data.skipped ? ` (${data.skipped} нь төлөв өөрчлөгдсөн тул алгаслаа)` : ''}`)
    onDeleted()
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
      <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.3rem' }}>Удаан хүлээгдэж буй ачаа</h2>
      <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 0.8rem', lineHeight: 1.5 }}>
        "{label}" төлөвт хамгийн удаан байгаа ачааг харж, шаардлагагүйг нь сонгож устгана.
      </p>
      <form onSubmit={load} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Хамгийн удсан</span>
        <input className="input" inputMode="numeric" value={limit} style={{ width: 80, minWidth: 0 }}
          onChange={e => setLimit(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label="Хэдэн ачаа" />
        <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>ачаа</span>
        <button className="btn" type="submit" disabled={loading} style={{ flexShrink: 0, marginLeft: 'auto' }}>
          {loading ? '...' : 'Харах'}
        </button>
      </form>

      {msg && <p style={{ fontSize: '0.82rem', color: msg.startsWith('✓') ? 'var(--green)' : 'var(--danger)', marginBottom: '0.75rem' }}>{msg}</p>}

      {items !== null && (
        items.length === 0
          ? <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>"{label}" төлөвтэй ачаа алга.</p>
          : <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  Бүгдийг сонгох <span style={{ color: 'var(--muted)' }}>({items.length} / нийт {total})</span>
                </label>
                <button onClick={remove} disabled={!selected.size || deleting} style={{
                  background: selected.size ? 'var(--danger)' : 'var(--surface2)', color: selected.size ? '#fff' : 'var(--muted)',
                  border: 'none', borderRadius: 'var(--radius)', padding: '0.45rem 0.9rem', fontSize: '0.8rem', fontWeight: 600,
                  cursor: selected.size && !deleting ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                }}>
                  {deleting ? 'Устгаж байна...' : `Сонгосныг устгах${selected.size ? ` (${selected.size})` : ''}`}
                </button>
              </div>
              <div className="card" style={{ overflow: 'hidden' }}>
                {items.map((s, i) => (
                  <label key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.55rem 0.9rem', cursor: 'pointer',
                    borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none', fontSize: '0.83rem',
                    background: selected.has(s.id) ? 'color-mix(in srgb, var(--danger) 7%, transparent)' : undefined,
                  }}>
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.trackCode}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[s.phone, s.name, s.description].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: s.days >= 60 ? 'var(--danger)' : s.days >= 30 ? '#d97706' : 'var(--text)' }}>
                        {s.sinceApprox ? '~' : ''}{s.days} хоног
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{fmt(s.since)}</div>
                    </div>
                  </label>
                ))}
              </div>
              {items.some(i => i.sinceApprox) && (
                <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                  ~ — 2026 оны 6-р сараас өмнөх ачаанд Эрээнд ирсэн огноо хадгалагдаагүй тул сүүлд өөрчлөгдсөн огноогоор тооцов.
                </p>
              )}
            </>
      )}
    </div>
  )
}

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

const MAX_ROWS = 500

// Огноог Улаанбаатарын цагаар YYYY.MM.DD — өдрөөр бүлэглэх түлхүүр ч мөн
const UB_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: '2-digit', day: '2-digit' })
function ubDay(iso: string): string {
  return UB_DAY.format(new Date(iso)).replace(/-/g, '.')
}

// Эрээнд ирсэн төлөвт хамгийн удаан байгаа ачааг олж, сонгож устгах хэсэг
export default function StaleEreen({ label, onDeleted }: { label: string; onDeleted: () => void }) {
  const [limit, setLimit] = useState('20')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [items, setItems] = useState<StaleItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState('')
  const [view, setView] = useState<'list' | 'day'>('list')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  async function load(e?: React.FormEvent) {
    e?.preventDefault()
    setLoading(true)
    setMsg('')
    // Огноогоор шүүхэд тэр хугацааны бүх ачааг (нэг удаад 500 хүртэл) харуулна; тоо зөвхөн шүүлтгүй үед
    const qs = new URLSearchParams({ limit: from || to ? String(MAX_ROWS) : limit || '20' })
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    const res = await fetch(`/api/admin/ereen/stale?${qs}`)
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

  // Олон ачааг нэг дор сонгох/болих — өдрийн чек
  function setMany(ids: number[], on: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  function toggleDay(day: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  // Ачааг Эрээнд ирсэн өдрөөр нь бүлэглэнэ (жагсаалт аль хэдийн хуучнаас шинэ рүү эрэмбэлэгдсэн)
  const groups: { day: string; items: StaleItem[] }[] = []
  for (const it of items ?? []) {
    const day = ubDay(it.since)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.items.push(it)
    else groups.push({ day, items: [it] })
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

  const daysColor = (days: number) => days >= 60 ? 'var(--danger)' : days >= 30 ? '#d97706' : 'var(--text)'

  function row(s: StaleItem, last: boolean, showDate: boolean) {
    return (
      <label key={s.id} style={{
        display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.55rem 0.9rem', cursor: 'pointer',
        borderBottom: last ? 'none' : '1px solid var(--border)', fontSize: '0.83rem',
        background: selected.has(s.id) ? 'color-mix(in srgb, var(--danger) 7%, transparent)' : undefined,
      }}>
        <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.trackCode}</div>
          <div style={{ fontSize: '0.74rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[s.phone, s.name, s.description].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        {showDate && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontWeight: 700, color: daysColor(s.days) }}>{s.sinceApprox ? '~' : ''}{s.days} хоног</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{ubDay(s.since)}</div>
          </div>
        )}
      </label>
    )
  }

  return (
    <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
      <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.3rem' }}>Удаан хүлээгдэж буй ачаа</h2>
      <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 0.8rem', lineHeight: 1.5 }}>
        "{label}" төлөвт хамгийн удаан байгаа ачааг харж, шаардлагагүйг нь сонгож устгана.
      </p>
      <form onSubmit={load} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '1rem' }}>
        {from || to ? (
          <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Сонгосон хугацааны бүх ачаа</span>
        ) : (
          <>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Хамгийн удсан</span>
            <input className="input" inputMode="numeric" value={limit} style={{ width: 80, minWidth: 0 }}
              onChange={e => setLimit(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label="Хэдэн ачаа" />
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>ачаа</span>
          </>
        )}
        <button className="btn" type="submit" disabled={loading} style={{ flexShrink: 0, marginLeft: 'auto' }}>
          {loading ? '...' : 'Харах'}
        </button>
      </form>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', margin: '-0.4rem 0 1rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
        <span>Эрээнд ирсэн огноо:</span>
        <input type="date" className="input" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)}
          aria-label="Эхлэх огноо" style={{ width: 'auto', minWidth: 0, padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} />
        <span>—</span>
        <input type="date" className="input" value={to} min={from || undefined} onChange={e => setTo(e.target.value)}
          aria-label="Дуусах огноо" style={{ width: 'auto', minWidth: 0, padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} />
        {(from || to) && (
          <button type="button" onClick={() => { setFrom(''); setTo('') }}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit', padding: 0 }}>
            Цэвэрлэх
          </button>
        )}
      </div>

      {msg && <p style={{ fontSize: '0.82rem', color: msg.startsWith('✓') ? 'var(--green)' : 'var(--danger)', marginBottom: '0.75rem' }}>{msg}</p>}

      {items !== null && (
        items.length === 0
          ? <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{from || to ? 'Энэ хугацаанд' : ''} "{label}" төлөвтэй ачаа алга.</p>
          : <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '0.3rem', width: '100%' }}>
                  {([['list', 'Жагсаалтаар'], ['day', 'Өдрөөр']] as const).map(([v, t]) => (
                    <button key={v} type="button" onClick={() => setView(v)} style={{
                      padding: '0.3rem 0.8rem', borderRadius: 100, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${view === v ? 'var(--accent)' : 'var(--border)'}`,
                      background: view === v ? 'var(--accent-light)' : 'var(--surface)',
                      color: view === v ? 'var(--accent)' : 'var(--muted)', fontWeight: view === v ? 700 : 500,
                    }}>{t}</button>
                  ))}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  Бүгдийг сонгох <span style={{ color: 'var(--muted)' }}>({items.length} / {from || to ? 'шүүлтэд' : 'нийт'} {total})</span>
                </label>
                <button onClick={remove} disabled={!selected.size || deleting} style={{
                  background: selected.size ? 'var(--danger)' : 'var(--surface2)', color: selected.size ? '#fff' : 'var(--muted)',
                  border: 'none', borderRadius: 'var(--radius)', padding: '0.45rem 0.9rem', fontSize: '0.8rem', fontWeight: 600,
                  cursor: selected.size && !deleting ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                }}>
                  {deleting ? 'Устгаж байна...' : `Сонгосныг устгах${selected.size ? ` (${selected.size})` : ''}`}
                </button>
              </div>
              {view === 'list' ? (
                <div className="card" style={{ overflow: 'hidden' }}>
                  {items.map((s, i) => row(s, i === items.length - 1, true))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {groups.map(g => {
                    const ids = g.items.map(i => i.id)
                    const picked = ids.filter(id => selected.has(id)).length
                    const open = expanded.has(g.day)
                    const oldest = g.items[0]
                    return (
                      <div key={g.day} className="card" style={{ overflow: 'hidden', borderColor: picked ? 'var(--danger)' : undefined }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem 0.9rem', background: 'var(--surface2)' }}>
                          <input type="checkbox" aria-label={`${g.day} өдрийн бүх ачаа`}
                            checked={picked === ids.length}
                            ref={el => { if (el) el.indeterminate = picked > 0 && picked < ids.length }}
                            onChange={() => setMany(ids, picked !== ids.length)} style={{ flexShrink: 0 }} />
                          <button type="button" onClick={() => toggleDay(g.day)} style={{
                            flex: 1, display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'none', border: 'none',
                            padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)', textAlign: 'left', minWidth: 0,
                          }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}>▶</span>
                            <b style={{ fontFamily: 'monospace', fontSize: '0.88rem' }}>{g.day}</b>
                            <span style={{ fontSize: '0.72rem', padding: '0.05rem 0.5rem', borderRadius: 100, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                              {picked ? `${picked}/` : ''}{g.items.length} ачаа
                            </span>
                            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', fontWeight: 700, color: daysColor(oldest.days) }}>
                              {oldest.sinceApprox ? '~' : ''}{oldest.days} хоног
                            </span>
                          </button>
                        </div>
                        {open && g.items.map((s, i) => row(s, i === g.items.length - 1, false))}
                      </div>
                    )
                  })}
                </div>
              )}
              {total > items.length && (from || to) && (
                <p style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '0.5rem' }}>
                  Энэ хугацаанд {total} ачаа байна — эхний {items.length}-г харууллаа. Устгасны дараа дахин "Харах" дарна уу.
                </p>
              )}
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

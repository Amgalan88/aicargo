'use client'
import { useCallback, useEffect, useState } from 'react'

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

const MAX_ROWS = 2000

// Огноог Улаанбаатарын цагаар YYYY.MM.DD — өдрөөр бүлэглэх түлхүүр ч мөн
const UB_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: '2-digit', day: '2-digit' })
function ubDay(iso: string): string {
  return UB_DAY.format(new Date(iso)).replace(/-/g, '.')
}

// Эрээнд ирсэн төлөвтэй бүх ачааг өдрөөр нь харуулна. Өдрийг сонгоход тэр өдөр
// болон түүнээс өмнөх бүх өдөр сонгогдоно — "энэ өдрөөс өмнөхийг цэвэрлэх" гэсэн хэрэглээнд
export default function StaleEreen({ label, onDeleted }: { label: string; onDeleted: () => void }) {
  const [items, setItems] = useState<StaleItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/ereen/stale?limit=${MAX_ROWS}`)
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setMsg(data.error || 'Алдаа гарлаа'); return false }
    setItems(data.items)
    setTotal(data.total)
    setSelected(new Set())
    return true
  }, [])
  useEffect(() => { load() }, [load])

  // Ачааг Эрээнд ирсэн өдрөөр нь бүлэглэнэ. API хуучнаас шинэ рүү буцаадаг тул эргүүлж шинэ өдрийг эхэнд гаргана
  const groups: { day: string; items: StaleItem[] }[] = []
  for (const it of [...(items ?? [])].reverse()) {
    const day = ubDay(it.since)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.items.push(it)
    else groups.push({ day, items: [it] })
  }

  const isDayFull = (g: { items: StaleItem[] }) => g.items.every(i => selected.has(i.id))

  // Өдөр сонгох: тэр өдөр ба өмнөх (доор байгаа) бүх өдөр. Болих: тэр өдөр ба хойших (дээр байгаа) бүх өдөр
  function pickDay(index: number) {
    const on = !isDayFull(groups[index])
    setSelected(prev => {
      const next = new Set(prev)
      const range = on ? groups.slice(index) : groups.slice(0, index + 1)
      for (const g of range) {
        for (const it of g.items) {
          if (on) next.add(it.id)
          else next.delete(it.id)
        }
      }
      return next
    })
  }

  function toggleItem(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleOpen(day: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  // Сонголт хамрах хамгийн сүүлийн (шинэ) өдөр — устгах товчны тайлбарт
  const lastPickedDay = groups.find(g => g.items.some(i => selected.has(i.id)))?.day

  // Сонголтын хураангуй: хэдэн өдөр, хамгийн хуучин ба шинэ өдөр
  const pickedGroups = groups.filter(g => g.items.some(i => selected.has(i.id)))
  const firstPickedDay = pickedGroups[pickedGroups.length - 1]?.day
  const summary = pickedGroups.length > 1 ? `${firstPickedDay} – ${lastPickedDay}, ${pickedGroups.length} өдөр` : `${lastPickedDay}`

  function openConfirm() {
    if (!selected.size) return
    setConfirmText('')
    setConfirmOpen(true)
  }

  async function remove() {
    if (!selected.size || confirmText !== 'УСТГАХ') return
    setDeleting(true)
    const res = await fetch('/api/admin/ereen/stale', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected], confirm: confirmText, note: summary }),
    })
    setConfirmOpen(false)
    const data = await res.json().catch(() => ({}))
    setDeleting(false)
    await load()
    onDeleted()
    if (!res.ok) {
      // Сүлжээний алдааны үед устсан эсэх нь тодорхойгүй — жагсаалт шинэчлэгдсэн тул бодит төлөвийг харуулна
      setMsg(`${data.error || 'Алдаа гарлаа'}. Жагсаалтыг шинэчиллээ — устсан эсэхийг шалгана уу.`)
      return
    }
    setMsg(`✓ ${data.count} ачаа устгагдлаа${data.skipped ? ` (${data.skipped} нь төлөв өөрчлөгдсөн тул алгаслаа)` : ''}`)
  }

  const daysColor = (days: number) => days >= 60 ? 'var(--danger)' : days >= 30 ? '#d97706' : 'var(--text)'

  return (
    <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.3rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>"{label}" ачаа — өдрөөр</h2>
        <button type="button" onClick={() => { setMsg(''); load() }} disabled={loading} style={{
          background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit', padding: 0,
        }}>{loading ? '...' : '↻ Шинэчлэх'}</button>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 0.9rem', lineHeight: 1.5 }}>
        Шинэ өдөр дээрээ. Өдрийг чеклэхэд тэр өдөр болон түүнээс өмнөх (доорх) бүх өдөр сонгогдоно. Өдрийг дарж доторх ачааг харна.
      </p>

      {msg && <p style={{ fontSize: '0.82rem', color: msg.startsWith('✓') ? 'var(--green)' : 'var(--danger)', marginBottom: '0.75rem' }}>{msg}</p>}

      {items === null ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{loading ? 'Ачааллаж байна...' : ''}</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>"{label}" төлөвтэй ачаа алга.</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
              Нийт <b style={{ color: 'var(--text)' }}>{total}</b> ачаа · {groups.length} өдөр
              {selected.size > 0 && (
                <> · <button type="button" onClick={() => setSelected(new Set())} style={{
                  background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit', padding: 0,
                }}>сонголт цуцлах</button></>
              )}
            </span>
            <button onClick={openConfirm} disabled={!selected.size || deleting} style={{
              background: selected.size ? 'var(--danger)' : 'var(--surface2)', color: selected.size ? '#fff' : 'var(--muted)',
              border: 'none', borderRadius: 'var(--radius)', padding: '0.45rem 0.9rem', fontSize: '0.8rem', fontWeight: 600,
              cursor: selected.size && !deleting ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            }}>
              {deleting ? 'Устгаж байна...' : selected.size ? `${lastPickedDay} хүртэлх ${selected.size} ачааг устгах` : 'Өдөр сонгоно уу'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {groups.map((g, index) => {
              const picked = g.items.filter(i => selected.has(i.id)).length
              const full = picked === g.items.length
              const open = expanded.has(g.day)
              const oldest = g.items[g.items.length - 1]
              return (
                <div key={g.day} className="card" style={{ overflow: 'hidden', borderColor: picked ? 'var(--danger)' : undefined }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem 0.9rem',
                    background: picked ? 'color-mix(in srgb, var(--danger) 7%, var(--surface2))' : 'var(--surface2)',
                  }}>
                    <input type="checkbox" aria-label={`${g.day} хүртэлх бүх ачаа`}
                      checked={full}
                      ref={el => { if (el) el.indeterminate = picked > 0 && !full }}
                      onChange={() => pickDay(index)} style={{ flexShrink: 0, width: 17, height: 17, cursor: 'pointer' }} />
                    <button type="button" onClick={() => toggleOpen(g.day)} style={{
                      flex: 1, display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'none', border: 'none',
                      padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)', textAlign: 'left', minWidth: 0,
                    }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--muted)', transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}>▶</span>
                      <b style={{ fontFamily: 'monospace', fontSize: '0.88rem' }}>{g.day}</b>
                      <span style={{ fontSize: '0.72rem', padding: '0.05rem 0.5rem', borderRadius: 100, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {picked && !full ? `${picked}/` : ''}{g.items.length} ачаа
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.78rem', fontWeight: 700, color: daysColor(oldest.days), whiteSpace: 'nowrap' }}>
                        {oldest.sinceApprox ? '~' : ''}{oldest.days} хоног
                      </span>
                    </button>
                  </div>
                  {open && g.items.map((s, i) => (
                    <label key={s.id} style={{
                      display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.5rem 0.9rem 0.5rem 1.6rem', cursor: 'pointer',
                      borderTop: i === 0 ? '1px solid var(--border)' : undefined,
                      borderBottom: i < g.items.length - 1 ? '1px solid var(--border)' : 'none', fontSize: '0.83rem',
                      background: selected.has(s.id) ? 'color-mix(in srgb, var(--danger) 5%, transparent)' : undefined,
                    }}>
                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleItem(s.id)} style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.trackCode}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {[s.phone, s.name, s.description].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )
            })}
          </div>

          {total > items.length && (
            <p style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '0.5rem' }}>
              Нийт {total} ачаанаас хамгийн хуучин {items.length}-г харууллаа. Устгасны дараа үлдсэн нь гарна.
            </p>
          )}
          {items.some(i => i.sinceApprox) && (
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
              ~ — 2026 оны 6-р сараас өмнөх ачаанд Эрээнд ирсэн огноо хадгалагдаагүй тул сүүлд өөрчлөгдсөн огноогоор тооцов.
            </p>
          )}
        </>
      )}
      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
          <div className="card" role="dialog" aria-modal="true" style={{ width: '100%', maxWidth: 420, padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: 'var(--danger)' }}>⚠ {selected.size} ачаа устгагдана</h3>
            <div style={{ fontSize: '0.84rem', lineHeight: 1.6, marginBottom: '0.9rem' }}>
              <div>Хугацаа: <b>{summary}</b></div>
              <div style={{ color: 'var(--muted)' }}>
                "{label}" төлөвтэй эдгээр ачаа бүрмөсөн устгагдана. Устгасан ачаа бүр түүхэнд хадгалагдах тул трак кодоор хайхад
                хэзээ, хэн устгасан нь харагдана.
              </div>
            </div>
            <p style={{ fontSize: '0.82rem', marginBottom: '0.5rem' }}>Үргэлжлүүлэхийн тулд <strong>УСТГАХ</strong> гэж бичнэ үү:</p>
            <input className="input" placeholder="УСТГАХ" value={confirmText} onChange={e => setConfirmText(e.target.value)} autoFocus
              style={{ marginBottom: '1rem', borderColor: confirmText === 'УСТГАХ' ? 'var(--danger)' : undefined }} />
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button className="btn" onClick={remove} disabled={confirmText !== 'УСТГАХ' || deleting}
                style={{ flex: 1, background: 'var(--danger)', borderColor: 'var(--danger)', opacity: confirmText === 'УСТГАХ' ? 1 : 0.4 }}>
                {deleting ? 'Устгаж байна...' : 'Устгах'}
              </button>
              <button onClick={() => setConfirmOpen(false)} disabled={deleting} style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem' }}>
                Болих
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

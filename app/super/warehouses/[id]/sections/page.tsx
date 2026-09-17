'use client'
import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { expandSectionRange, normalizeSectionCode } from '@/lib/warehouse'

interface Section {
  id: number
  code: string
  note: string | null
  active: boolean
}

export default function SectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const api = `/api/super/warehouses/${id}/sections`

  const [list, setList] = useState<Section[] | null>(null)
  const [mode, setMode] = useState<'single' | 'range'>('single')
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')
  const [prefix, setPrefix] = useState('A-')
  const [from, setFrom] = useState('1')
  const [to, setTo] = useState('20')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editNote, setEditNote] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(api)
    if (res.ok) setList(await res.json())
    else toast.error('Ачаалахад алдаа гарлаа')
  }, [api])
  useEffect(() => { load() }, [load])

  const range = mode === 'range' ? expandSectionRange(prefix, Number(from), Number(to)) : null
  const preview = Array.isArray(range)
    ? range.length <= 4 ? range.join(', ') : `${range[0]}, ${range[1]} … ${range[range.length - 1]} (${range.length} хэсэг)`
    : range

  async function add() {
    const body = mode === 'single'
      ? { code, note }
      : { prefix, from: Number(from), to: Number(to) }
    if (mode === 'single' && !normalizeSectionCode(code)) { toast.error('Хэсгийн код оруулна уу'); return }
    if (mode === 'range' && !Array.isArray(range)) { toast.error(range ?? 'Муж буруу'); return }

    setSaving(true)
    const res = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast.error(data.error || 'Алдаа гарлаа'); return }
    setList(data.sections)
    toast.success(data.skipped ? `${data.created} нэмэгдлээ, ${data.skipped} нь өмнө бүртгэлтэй байсан` : `${data.created} хэсэг нэмэгдлээ`)
    setCode('')
    setNote('')
    router.refresh()
  }

  async function patch(s: Section, changes: Partial<Section>) {
    const res = await fetch(api, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, ...changes }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error || 'Алдаа гарлаа'); return false }
    load()
    return true
  }

  async function saveEdit(s: Section) {
    if (await patch(s, { code: editCode, note: editNote })) setEditId(null)
  }

  async function remove(s: Section) {
    if (!confirm(`${s.code} хэсгийг устгах уу?`)) return
    const res = await fetch(api, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error || 'Устгаж чадсангүй'); return }
    setList(l => l && l.filter(x => x.id !== s.id))
    router.refresh()
  }

  const q = search.trim().toUpperCase()
  const shown = (list ?? []).filter(s => !q || s.code.includes(q) || (s.note ?? '').toUpperCase().includes(q))
  const activeCount = (list ?? []).filter(s => s.active).length

  return (
    <div>
      <p style={{ color: 'var(--muted)', fontSize: '0.83rem', margin: '0 0 1rem', lineHeight: 1.6 }}>
        Эрээний агуулах доторх зай талбайнууд. Гэрээ батлахдаа каргод эндээс нэг хэсэг оноож өгнө.
        Идэвхгүй хэсэг сонголтод гарахгүй.
      </p>

      <div className="card" style={{ padding: '1.1rem 1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.9rem' }}>
          <ModeBtn on={mode === 'single'} onClick={() => setMode('single')}>Нэг хэсэг</ModeBtn>
          <ModeBtn on={mode === 'range'} onClick={() => setMode('range')}>Олноор (муж)</ModeBtn>
        </div>

        {mode === 'single' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 160px) 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Код</label>
              <input className="input" placeholder="A-12" value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && add()} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Тэмдэглэл</label>
              <input className="input" placeholder="жш: 2-р давхар, хаалганы хажууд" value={note}
                onChange={e => setNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && add()} />
            </div>
            <button className="btn" onClick={add} disabled={saving}>{saving ? '...' : 'Нэмэх'}</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 110px)) auto', gap: '0.5rem', alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Угтвар</label>
                <input className="input" value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Эхлэх №</label>
                <input className="input" inputMode="numeric" value={from} onChange={e => setFrom(e.target.value.replace(/\D/g, ''))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Дуусах №</label>
                <input className="input" inputMode="numeric" value={to} onChange={e => setTo(e.target.value.replace(/\D/g, ''))} />
              </div>
              <button className="btn" onClick={add} disabled={saving || !Array.isArray(range)}>
                {saving ? '...' : 'Нэмэх'}
              </button>
            </div>
            <p style={{ fontSize: '0.76rem', margin: '0.5rem 0 0', color: Array.isArray(range) ? 'var(--muted)' : 'var(--danger)' }}>
              {preview} {Array.isArray(range) && '· бүртгэлтэй кодыг алгасна'}
            </p>
          </>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
          {list && <>Нийт <b style={{ color: 'var(--text)' }}>{list.length}</b> · идэвхтэй {activeCount}</>}
        </div>
        {list && list.length > 8 && (
          <input className="input" placeholder="Хайх..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 200 }} />
        )}
      </div>

      {list === null ? (
        <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>
      ) : list.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
          Зай талбай бүртгээгүй байна. Дээрээс нэг нэгээр эсвэл олноор нь нэмнэ үү.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {shown.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem',
              borderBottom: '1px solid var(--border)', opacity: s.active ? 1 : 0.55,
            }}>
              {editId === s.id ? (
                <>
                  <input className="input" value={editCode} onChange={e => setEditCode(e.target.value.toUpperCase())}
                    style={{ width: 110, fontSize: '0.85rem', padding: '0.35rem 0.5rem' }} autoFocus />
                  <input className="input" value={editNote} placeholder="Тэмдэглэл" onChange={e => setEditNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(s); if (e.key === 'Escape') setEditId(null) }}
                    style={{ flex: 1, fontSize: '0.85rem', padding: '0.35rem 0.5rem' }} />
                  <button className="btn" style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }} onClick={() => saveEdit(s)}>Хадгалах</button>
                  <button className="btn-ghost" style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }} onClick={() => setEditId(null)}>Болих</button>
                </>
              ) : (
                <>
                  <span style={{
                    fontWeight: 700, fontSize: '0.85rem', fontFamily: 'ui-monospace, monospace',
                    background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6,
                    padding: '0.15rem 0.5rem', minWidth: 64, textAlign: 'center',
                  }}>{s.code}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.note || ''}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: s.active ? 'var(--green)' : 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {s.active ? 'Идэвхтэй' : 'Идэвхгүй'}
                  </span>
                  <button style={iconBtn} title={s.active ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'}
                    onClick={() => patch(s, { active: !s.active })}>{s.active ? '⏸' : '▶'}</button>
                  <button style={iconBtn} title="Засах"
                    onClick={() => { setEditId(s.id); setEditCode(s.code); setEditNote(s.note ?? '') }}>✏️</button>
                  <button style={{ ...iconBtn, color: 'var(--danger)' }} title="Устгах" onClick={() => remove(s)}>🗑</button>
                </>
              )}
            </div>
          ))}
          {shown.length === 0 && (
            <p style={{ padding: '1rem', margin: 0, color: 'var(--muted)', fontSize: '0.83rem' }}>Олдсонгүй.</p>
          )}
        </div>
      )}
    </div>
  )
}

function ModeBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
      background: on ? 'var(--accent-light)' : 'transparent',
      color: on ? 'var(--accent)' : 'var(--muted)',
      borderRadius: 100, padding: '0.3rem 0.8rem', fontSize: '0.78rem', fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit',
    }}>{children}</button>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', cursor: 'pointer',
  padding: '0.28rem 0.45rem', borderRadius: 6, fontSize: '0.8rem', lineHeight: 1, color: 'var(--text)',
}

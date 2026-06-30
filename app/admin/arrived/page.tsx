'use client'
import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'

function fmtDT(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear().toString().slice(2)}.${d.getMonth() + 1}.${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Form { trackCode: string; phone: string; adminPrice: string; adminNote: string }
const EMPTY: Form = { trackCode: '', phone: '', adminPrice: '', adminNote: '' }

interface SearchResult {
  id: number; trackCode: string; phone: string | null; adminPrice: number | null
  adminNote: string | null; createdAt: string; updatedAt?: string; description?: string | null
  user?: { name: string; phone: string } | null
}

interface TodayEntry { phone: string; description: string }

function CopyPhone({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(phone)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <span onClick={copy} title="Хуулах" style={{
      fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer',
      color: copied ? 'var(--green)' : 'var(--accent)',
      fontSize: '0.88rem',
    }}>{copied ? '✓ Хуулагдлаа' : phone}</span>
  )
}

export default function ArrivedPage() {
  const [form, setForm] = useState<Form>(EMPTY)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [phoneLocked, setPhoneLocked] = useState(false)
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({})
  const trackRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [editing, setEditing] = useState<SearchResult | null>(null)
  const [editForm, setEditForm] = useState({ adminPrice: '', adminNote: '', phone: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [todayList, setTodayList] = useState<TodayEntry[]>([])
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0, noPrice: 0 })
  const xlsxRef = useRef<HTMLInputElement>(null)
  const [xlsxMsg, setXlsxMsg] = useState('')
  const [xlsxLoading, setXlsxLoading] = useState(false)

  function buildTodayList(shipments: SearchResult[]) {
    const todayStr = new Date().toLocaleDateString('en-CA')
    const today = shipments.filter(s => {
      if (!s.updatedAt) return false
      return new Date(s.updatedAt).toLocaleDateString('en-CA') === todayStr
    })
    const map = new Map<string, Map<string, number>>()
    for (const s of today) {
      const phone = s.phone ?? '—'
      if (!map.has(phone)) map.set(phone, new Map())
      const desc = s.adminNote ?? ''
      map.get(phone)!.set(desc, (map.get(phone)!.get(desc) ?? 0) + 1)
    }
    const result: TodayEntry[] = []
    for (const [phone, descMap] of map) {
      let topDesc = ''; let topCount = 0
      for (const [desc, count] of descMap) { if (count > topCount) { topCount = count; topDesc = desc } }
      result.push({ phone, description: topDesc })
    }
    setTodayList(result)
  }

  async function loadToday() {
    const [listRes, statsRes] = await Promise.all([
      fetch('/api/admin/arrived/search?q='),
      fetch('/api/admin/arrived/search?stats=1'),
    ])
    if (listRes.ok) buildTodayList(await listRes.json())
    if (statsRes.ok) {
      const s = await statsRes.json()
      setTodayStats({ count: s.count, total: s.total, noPrice: s.noPrice })
    }
  }

  useEffect(() => { loadToday() }, [])

  function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
        const rows = data
          .map(row => {
            const priceRaw = Number(row[2])
            return {
              trackCode: String(row[0] ?? '').trim().toUpperCase(),
              phone: String(row[1] ?? '').trim() || undefined,
              price: !isNaN(priceRaw) && priceRaw > 0 ? priceRaw : undefined,
            }
          })
          .filter(r => r.trackCode.length >= 4)
        if (rows.length === 0) { setXlsxMsg('Трак код олдсонгүй'); return }
        if (!confirm(`${rows.length} бараа Ирсэн статустай болгох уу?`)) return
        setXlsxLoading(true)
        const res = await fetch('/api/admin/arrived', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows }),
        })
        setXlsxLoading(false)
        if (res.ok) {
          const d = await res.json()
          setXlsxMsg(`✓ ${d.count} бараа Ирсэн статустай болсон`)
          loadToday()
        } else {
          setXlsxMsg('Алдаа гарлаа')
        }
      } catch { setXlsxMsg('Файл уншихад алдаа гарлаа') }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  function openEdit(s: SearchResult) {
    setEditing(s)
    setEditForm({
      adminPrice: s.adminPrice ? String(s.adminPrice) : '',
      adminNote: s.adminNote ?? '',
      phone: s.phone ?? '',
    })
  }

  async function saveEdit() {
    if (!editing) return
    setEditLoading(true)
    const res = await fetch('/api/admin/arrived', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editing.id, ...editForm }),
    })
    setEditLoading(false)
    if (res.ok) {
      const updated = await res.json()
      setSearchResults(prev => prev?.map(s => s.id === editing.id ? { ...s, adminPrice: updated.adminPrice, adminNote: updated.adminNote, phone: updated.phone } : s) ?? null)
      setEditing(null)
    }
  }

  async function revert(id: number) {
    if (!confirm('Энэ барааг Эрээнд ирсэн төлөвт буцаах уу?')) return
    const res = await fetch('/api/admin/arrived', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setSearchResults(prev => prev?.filter(s => s.id !== id) ?? null)
  }

  async function search(e: React.FormEvent) {
    e.preventDefault()
    setSearching(true)
    const res = await fetch(`/api/admin/arrived/search?q=${encodeURIComponent(searchQ)}`)
    setSearching(false)
    if (res.ok) setSearchResults(await res.json())
  }

  function set(k: keyof Form, v: string) {
    setForm(f => ({ ...f, [k]: v }))
    setTouched(t => ({ ...t, [k]: true }))
  }

  async function lookupCode(code: string) {
    const c = code.trim().toUpperCase()
    if (!c) return
    try {
      const res = await fetch(`/api/track/${encodeURIComponent(c)}`)
      if (!res.ok) return
      const data = await res.json()
      const phone = data.user?.phone || data.phone || ''
      if (phone) { setForm(f => ({ ...f, phone })); setPhoneLocked(true) }
      else setPhoneLocked(false)
      if (data.adminPrice) setForm(f => ({ ...f, adminPrice: String(data.adminPrice) }))
      if (data.adminNote) setForm(f => ({ ...f, adminNote: data.adminNote }))
    } catch { }
  }

  const valid = {
    trackCode: form.trackCode.trim().length >= 4,
    phone: /^\d{8}$/.test(form.phone.trim()),
    adminPrice: form.adminPrice.trim() !== '' && Number(form.adminPrice) >= 0,
  }
  const canSave = valid.trackCode && valid.phone && valid.adminPrice

  function fe(k: keyof typeof valid) { return touched[k] && !valid[k] }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTouched({ trackCode: true, phone: true, adminPrice: true })
    if (!canSave) return
    setLoading(true)
    setError('')
    setResult(null)
    const res = await fetch('/api/admin/arrived', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    setResult(data)
    setForm(EMPTY)
    setTouched({})
    setPhoneLocked(false)
    loadToday()
    setTimeout(() => trackRef.current?.focus(), 50)
  }

  return (
    <div className="page-wide">
      <h1 className="section-title">Ирсэн</h1>

      {/* Excel bulk upload */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <input ref={xlsxRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcel} style={{ display: 'none' }} />
        <button onClick={() => {
          alert('Excel форматын дагуу оруулна уу:\n\nA багана — Трак код (заавал)\nB багана — Утасны дугаар (заавал)\nC багана — Үнэ (заавал)\n\nЖишээ:\nYT8853194305559  99001122  3000\nJT5467125484093  99001122  1500')
          xlsxRef.current?.click()
        }} disabled={xlsxLoading} style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'var(--surface)', border: '1px dashed var(--border)',
          borderRadius: 'var(--radius)', padding: '0.5rem 1rem',
          cursor: 'pointer', fontSize: '0.83rem', color: 'var(--muted)', fontFamily: 'inherit',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          {xlsxLoading ? 'Оруулж байна...' : 'Excel-ээр bulk оруулах'}
        </button>
        {xlsxMsg && <span style={{ fontSize: '0.8rem', color: xlsxMsg.startsWith('✓') ? 'var(--accent)' : 'var(--danger)' }}>{xlsxMsg}</span>}
      </div>

      <div className="arrived-grid">
        {/* Col 1 — Search + Today list */}
        <div>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.8rem' }}>Бүртгэгдсэн бараа хайх</h2>
          <form onSubmit={search} style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem' }}>
            <input className="input" placeholder="Утасны дугаар эсвэл трак код"
              value={searchQ} onChange={e => { setSearchQ(e.target.value); setSearchResults(null) }}
              style={{ minWidth: 0 }} />
            <button className="btn" type="submit" disabled={searching || !searchQ.trim()} style={{ flexShrink: 0 }}>
              {searching ? '...' : 'Хайх'}
            </button>
          </form>

          {searchResults !== null && (
            searchResults.length === 0
              ? <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Олдсонгүй.</p>
              : /^\d{8}$/.test(searchQ.trim())
                ? (() => {
                    // Group by date
                    const byDate = new Map<string, SearchResult[]>()
                    for (const s of searchResults) {
                      const d = s.updatedAt ? new Date(s.updatedAt).toLocaleDateString('en-CA') : '—'
                      if (!byDate.has(d)) byDate.set(d, [])
                      byDate.get(d)!.push(s)
                    }
                    const totalAll = searchResults.reduce((sum, s) => sum + (s.adminPrice ? Number(s.adminPrice) : 0), 0)
                    return (
                      <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.5rem', display: 'flex', gap: '0.75rem' }}>
                          <span>Нийт <strong style={{ color: 'var(--text)' }}>{searchResults.length}</strong> бараа</span>
                          {totalAll > 0 && <span><strong style={{ color: 'var(--accent)' }}>₮{totalAll.toLocaleString()}</strong></span>}
                        </div>
                        {Array.from(byDate.entries()).map(([date, items]) => {
                          const dayTotal = items.reduce((sum, s) => sum + (s.adminPrice ? Number(s.adminPrice) : 0), 0)
                          const d = new Date(date)
                          const label = `${d.getFullYear().toString().slice(2)}.${d.getMonth()+1}.${d.getDate()}`
                          return (
                            <div key={date} className="card" style={{ overflow: 'hidden', marginBottom: '0.6rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0.9rem', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }}>
                                <span style={{ fontWeight: 700 }}>{label} · {items.length} бараа</span>
                                {dayTotal > 0 && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>₮{dayTotal.toLocaleString()}</span>}
                              </div>
                              {items.map((s, i) => (
                                <div key={s.id} style={{ padding: '0.4rem 0.9rem', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none', fontSize: '0.82rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, flex: 1 }}>{s.trackCode}</span>
                                    {s.adminPrice && <span style={{ fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>₮{Number(s.adminPrice).toLocaleString()}</span>}
                                    <button onClick={() => openEdit(s)} title="Засах" style={iconBtn}>✏️</button>
                                    <button onClick={() => revert(s.id)} title="Эрээнд буцаах" style={{ ...iconBtn, color: 'var(--danger)' }}>↩</button>
                                  </div>
                                  {s.adminNote && <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.1rem' }}>{s.adminNote}</div>}
                                </div>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
                : <div className="card" style={{ overflow: 'hidden', marginBottom: '1.5rem' }}>
                  {searchResults.map((s, i) => (
                    <div key={s.id} style={{
                      padding: '0.45rem 0.9rem',
                      borderBottom: i < searchResults.length - 1 ? '1px solid var(--border)' : 'none',
                      fontSize: '0.82rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.trackCode}</span>
                        {s.adminPrice && <span style={{ fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>₮{Number(s.adminPrice).toLocaleString()}</span>}
                        <button onClick={() => openEdit(s)} title="Засах" style={iconBtn}>✏️</button>
                        <button onClick={() => revert(s.id)} title="Эрээнд буцаах" style={{ ...iconBtn, color: 'var(--danger)' }}>↩</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.1rem', color: 'var(--muted)', fontSize: '0.78rem' }}>
                        <span style={{ flexShrink: 0 }}>
                          {s.user ? `${s.user.name} · ${s.user.phone}` : (s.phone || '—')}
                        </span>
                        {s.adminNote && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.adminNote}</span>}
                        {s.updatedAt && <span style={{ fontFamily: 'monospace', flexShrink: 0, marginLeft: 'auto' }}>{fmtDT(s.updatedAt)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
          )}

          {todayList.length > 0 && (
            <>
              <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Өнөөдөр бүртгэсэн
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.8rem', background: 'var(--surface2)', borderRadius: '6px', padding: '0.2rem 0.6rem', color: 'var(--text)' }}>
                  {todayStats.count} бараа
                </span>
                <span style={{ fontSize: '0.8rem', background: 'var(--surface2)', borderRadius: '6px', padding: '0.2rem 0.6rem', color: 'var(--accent)', fontWeight: 700 }}>
                  ₮{todayStats.total.toLocaleString()}
                </span>
                {todayStats.noPrice > 0 && (
                  <span style={{ fontSize: '0.8rem', background: 'var(--surface2)', borderRadius: '6px', padding: '0.2rem 0.6rem', color: 'var(--danger)' }}>
                    {todayStats.noPrice} үнэгүй
                  </span>
                )}
              </div>
              <div className="card" style={{ overflow: 'hidden' }}>
                {todayList.map((t, i) => (
                  <div key={t.phone} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.38rem 0.9rem', gap: '0.6rem',
                    borderBottom: i < todayList.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <CopyPhone phone={t.phone} />
                    {t.description && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {t.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Col 2 — Form + result */}
        <div>
          <form onSubmit={submit} noValidate>
            <div className="admin-form-2col">
              <div className="form-group" style={{ margin: 0 }}>
                <label>Трак код <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input ref={trackRef} className="input" placeholder="CX-2024-00123"
                  value={form.trackCode}
                  onChange={e => { set('trackCode', e.target.value); setPhoneLocked(false) }}
                  onBlur={e => lookupCode(e.target.value)}
                  onKeyDown={async e => { if (e.key === 'Enter') { e.preventDefault(); await lookupCode((e.target as HTMLInputElement).value); phoneRef.current?.focus() } }}
                  style={{ borderColor: fe('trackCode') ? 'var(--danger)' : undefined }} />
                {fe('trackCode') && <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.3rem' }}>Хамгийн багадаа 4 тэмдэгт</p>}
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>
                  Утасны дугаар <span style={{ color: 'var(--danger)' }}>*</span>
                  {phoneLocked && <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginLeft: '0.4rem' }}>— олдлоо</span>}
                </label>
                <input ref={phoneRef} className="input" type="tel" placeholder="99001122"
                  value={form.phone}
                  onChange={e => { set('phone', e.target.value); setPhoneLocked(false) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); priceRef.current?.focus() } }}
                  readOnly={phoneLocked}
                  style={{
                    borderColor: fe('phone') ? 'var(--danger)' : undefined,
                    background: phoneLocked ? 'var(--surface2)' : undefined,
                  }} />
                {fe('phone') && <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.3rem' }}>Утасны дугаар оруулна уу</p>}
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Үнэ (₮) <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input ref={priceRef} className="input" type="number" placeholder="0" min="0"
                  value={form.adminPrice}
                  onChange={e => set('adminPrice', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); noteRef.current?.focus() } }}
                  style={{ borderColor: fe('adminPrice') ? 'var(--danger)' : undefined }} />
                {fe('adminPrice') && <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.3rem' }}>Үнэ оруулна уу</p>}
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Тайлбар</label>
                <textarea ref={noteRef} className="input" placeholder="Тэмдэглэл..." rows={1}
                  value={form.adminNote} onChange={e => set('adminNote', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canSave) submit(e as any) } }} />
              </div>
            </div>

            {error && <p className="msg-error" style={{ marginTop: '0.5rem' }}>{error}</p>}

            <button className="btn" type="submit" disabled={loading || !canSave}
              style={{ opacity: canSave ? 1 : 0.5, marginTop: '0.75rem' }}>
              {loading ? 'Хадгалж байна...' : 'Хадгалах'}
            </button>
          </form>

          {result && (
            <div className="card" style={{ marginTop: '1.2rem' }}>
              {(result.phone || result.user?.phone) && (
                <div className="card-row">
                  <span className="label">Утас</span>
                  <CopyPhone phone={result.user?.phone || result.phone} />
                </div>
              )}
              <div className="card-row">
                <span className="label">Трак код</span>
                <CopyPhone phone={result.trackCode} />
              </div>
              {result.adminPrice && (
                <div className="card-row">
                  <span className="label">Үнэ</span>
                  <strong style={{ color: 'var(--accent)' }}>₮{Number(result.adminPrice).toLocaleString()}</strong>
                </div>
              )}
              {result.adminNote && (
                <div className="card-row">
                  <span className="label">Тайлбар</span>
                  <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{result.adminNote}</span>
                </div>
              )}
            </div>
          )}
        </div>


      </div>

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: 380, padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 700 }}>Засах — <span style={{ fontFamily: 'monospace' }}>{editing.trackCode}</span></h3>
            <div className="form-group">
              <label>Утас</label>
              <input className="input" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="99001122" />
            </div>
            <div className="form-group">
              <label>Үнэ (₮)</label>
              <input className="input" type="number" min="0" value={editForm.adminPrice} onChange={e => setEditForm(f => ({ ...f, adminPrice: e.target.value }))} placeholder="0" />
            </div>
            <div className="form-group">
              <label>Тайлбар</label>
              <textarea className="input" rows={2} value={editForm.adminNote} onChange={e => setEditForm(f => ({ ...f, adminNote: e.target.value }))} placeholder="Тэмдэглэл..." />
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
              <button className="btn" onClick={saveEdit} disabled={editLoading} style={{ flex: 1 }}>{editLoading ? 'Хадгалж байна...' : 'Хадгалах'}</button>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem' }}>Болих</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.35rem',
  borderRadius: '4px', fontSize: '0.9rem', lineHeight: 1,
}

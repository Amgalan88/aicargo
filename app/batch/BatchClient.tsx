'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Lang = 'mn' | 'cn'
type Currency = 'MNT' | 'CNY'

// Багц feature = юань тооцоотой карго. Toggle нь зөвхөн хэл солино.
const T: Record<Lang, Record<string, string>> = {
  mn: {
    title: 'Багц ачаа бүртгэл',
    codes: 'Трак кодууд',
    codesPh: 'Код бүрийг шинэ мөрөнд эсвэл зайгаар...',
    codesHint: 'Сканнер ашиглаж болно — код бүр шинэ мөрөнд',
    phone: 'Утасны дугаар',
    price: 'Нийт үнэ',
    note: 'Тайлбар',
    notePh: 'Нэмэлт тэмдэглэл (заавал биш)...',
    save: 'Бүртгэх',
    saving: 'Хадгалж байна...',
    listTitle: 'Сүүлийн багцууд',
    items: 'ачаа',
    empty: 'Багц бүртгэгдээгүй байна',
    logout: 'Гарах',
    created: 'Багц бүртгэгдлээ',
    edit: 'Засах',
    cancel: 'Болих',
    saveEdit: 'Хадгалах',
    addCodes: 'Код нэмэх',
    addCodesPh: 'Нэмэх кодууд...',
    remove: 'Хасах',
    history: 'Түүх',
    statusE: 'Эрээнд',
    statusA: 'УБ руу ачигдсан',
    statusP: 'Олгосон',
    confirmRemove: 'Энэ кодыг багцаас хасах уу?',
  },
  cn: {
    title: '批量货物登记',
    codes: '快递单号',
    codesPh: '每行一个单号，或用空格分隔...',
    codesHint: '可使用扫码枪 — 每个单号一行',
    phone: '电话号码',
    price: '总价',
    note: '备注',
    notePh: '附加说明（可选）...',
    save: '登记',
    saving: '保存中...',
    listTitle: '最近批次',
    items: '件',
    empty: '暂无批次',
    logout: '退出',
    created: '登记成功',
    edit: '编辑',
    cancel: '取消',
    saveEdit: '保存',
    addCodes: '添加单号',
    addCodesPh: '要添加的单号...',
    remove: '移除',
    history: '记录',
    statusE: '二连',
    statusA: '已发往UB',
    statusP: '已取',
    confirmRemove: '从批次中移除此单号？',
  },
}

interface BatchShipment { id: number; trackCode: string }
interface BatchLog { id: number; userName: string; action: string; detail: string | null; createdAt: string }
interface Batch {
  id: number; phone: string; price: string; currency: Currency
  note: string | null
  status: string; createdAt: string
  shipments: BatchShipment[]; logs: BatchLog[]
}

function fmtPrice(price: string | number, currency: Currency) {
  const n = Number(price)
  return currency === 'CNY' ? `¥${n.toLocaleString()}` : `₮${n.toLocaleString()}`
}

export default function BatchClient() {
  const router = useRouter()
  const [lang, setLang] = useState<Lang>('mn')
  const t = T[lang]

  const [codes, setCodes] = useState('')
  const [phone, setPhone] = useState('')
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [batches, setBatches] = useState<Batch[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [editPhone, setEditPhone] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editAdd, setEditAdd] = useState('')
  const [logOpen, setLogOpen] = useState<number | null>(null)
  const codesRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    try {
      const l = localStorage.getItem('batch-lang')
      if (l === 'mn' || l === 'cn') setLang(l)
    } catch {}
    load()
  }, [])

  function switchLang(l: Lang) {
    setLang(l)
    try { localStorage.setItem('batch-lang', l) } catch {}
  }

  function load() {
    fetch('/api/batch')
      .then(r => r.ok ? r.json() : [])
      .then(setBatches)
      .catch(() => {})
  }

  // Зөвхөн мөрөөр тусгаарлана — кодод өөр шаардлага байхгүй (тоо, хэмжээ ч болно)
  function parseCodes(raw: string): string[] {
    return Array.from(new Set(raw.split(/\r?\n/).map(c => c.trim().toUpperCase()).filter(c => c.length > 0)))
  }

  const parsedCount = parseCodes(codes).length
  const canSave = parsedCount > 0 && /^\d{8}$/.test(phone) && price.trim() !== '' && Number(price) >= 0

  async function save() {
    if (!canSave || saving) return
    setSaving(true)
    setError('')
    setMsg('')
    try {
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: parseCodes(codes), phone, price: Number(price), note }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Error'); return }
      setMsg(`✓ ${t.created} — B-${data.id}`)
      setCodes(''); setPhone(''); setPrice(''); setNote('')
      load()
      setTimeout(() => codesRef.current?.focus(), 50)
      setTimeout(() => setMsg(''), 4000)
    } catch { setError('Connection error') }
    finally { setSaving(false) }
  }

  function startEdit(b: Batch) {
    setEditId(b.id)
    setEditPhone(b.phone)
    setEditPrice(String(Number(b.price)))
    setEditNote(b.note ?? '')
    setEditAdd('')
    setExpanded(b.id)
  }

  async function saveEdit() {
    if (editId === null) return
    const res = await fetch('/api/batch', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editId,
        phone: editPhone,
        price: Number(editPrice),
        note: editNote,
        addCodes: parseCodes(editAdd),
      }),
    })
    if (res.ok) { setEditId(null); load() }
    else { const d = await res.json().catch(() => ({})); setError(d.error || 'Error') }
  }

  async function removeCode(batchId: number, shipmentId: number) {
    if (!confirm(t.confirmRemove)) return
    await fetch('/api/batch', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: batchId, removeShipmentIds: [shipmentId] }),
    })
    load()
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const statusLabel: Record<string, string> = {
    EREEN_ARRIVED: t.statusE, ARRIVED: t.statusA, PICKED_UP: t.statusP,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div className="header-accent" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.7rem 5%', minHeight: 56, boxSizing: 'border-box',
        borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      }}>
        <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{t.title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Хэл солигч */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 100, overflow: 'hidden' }}>
            {(['mn', 'cn'] as Lang[]).map(l => (
              <button key={l} onClick={() => switchLang(l)} style={{
                padding: '0.3rem 0.85rem', border: 'none', cursor: 'pointer',
                fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit',
                background: lang === l ? 'var(--accent)' : 'var(--surface)',
                color: lang === l ? '#fff' : 'var(--muted)',
              }}>
                {l === 'mn' ? 'Монгол' : '中文'}
              </button>
            ))}
          </div>
          <button onClick={logout} style={{
            background: 'none', border: 'none', color: 'var(--muted)',
            cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit',
          }}>{t.logout}</button>
        </div>
      </div>

      <div className="page" style={{ maxWidth: 560 }}>
        {/* Бүртгэлийн форм */}
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div className="form-group">
            <label>{t.codes} {parsedCount > 0 && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>({parsedCount})</span>}</label>
            <textarea ref={codesRef} className="input" rows={6}
              placeholder={t.codesPh}
              value={codes} onChange={e => setCodes(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: '0.9rem' }} />
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.3rem' }}>{t.codesHint}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>{t.phone}</label>
              <input className="input" type="tel" placeholder="99001122" maxLength={8}
                value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>{t.price} (¥)</label>
              <input className="input" type="number" min="0" placeholder="0"
                value={price} onChange={e => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            <label>{t.note}</label>
            <input className="input" placeholder={t.notePh}
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
          {error && <p className="msg-error" style={{ marginTop: '0.75rem' }}>{error}</p>}
          {msg && <p style={{ color: 'var(--green)', fontSize: '0.85rem', marginTop: '0.75rem' }}>{msg}</p>}
          <button className="btn" onClick={save} disabled={!canSave || saving} style={{ width: '100%', marginTop: '1rem' }}>
            {saving ? t.saving : `${t.save}${parsedCount > 0 ? ` (${parsedCount})` : ''}`}
          </button>
        </div>

        {/* Багцын жагсаалт */}
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem' }}>{t.listTitle}</h2>
        {batches.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{t.empty}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {batches.map(b => (
              <div key={b.id} className="card" style={{ overflow: 'hidden' }}>
                <div
                  onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.7rem 1rem', cursor: 'pointer', gap: '0.5rem', flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <strong style={{ fontSize: '0.88rem' }}>B-{b.id}</strong>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{b.shipments.length} {t.items}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--muted)' }}>{b.phone}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <strong style={{ color: 'var(--accent)', fontSize: '0.88rem' }}>{fmtPrice(b.price, b.currency)}</strong>
                    <span className={`badge badge-${b.status}`} style={{ fontSize: '0.65rem' }}>{statusLabel[b.status] ?? b.status}</span>
                  </div>
                  {b.note && (
                    <div style={{ width: '100%', fontSize: '0.75rem', color: 'var(--muted)' }}>💬 {b.note}</div>
                  )}
                </div>

                {expanded === b.id && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '0.75rem 1rem', background: 'var(--bg)' }}>
                    {editId === b.id ? (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
                          <input className="input" type="tel" maxLength={8} value={editPhone}
                            onChange={e => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 8))} />
                          <input className="input" type="number" min="0" value={editPrice}
                            onChange={e => setEditPrice(e.target.value)} />
                        </div>
                        <input className="input" placeholder={t.notePh} value={editNote}
                          onChange={e => setEditNote(e.target.value)}
                          style={{ marginBottom: '0.6rem' }} />
                        <textarea className="input" rows={2} placeholder={t.addCodesPh}
                          value={editAdd} onChange={e => setEditAdd(e.target.value)}
                          style={{ fontFamily: 'monospace', fontSize: '0.85rem', marginBottom: '0.6rem' }} />
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn" onClick={saveEdit} style={{ fontSize: '0.8rem', padding: '0.45rem 1rem' }}>{t.saveEdit}</button>
                          <button className="btn-ghost" onClick={() => setEditId(null)} style={{ fontSize: '0.8rem', padding: '0.45rem 1rem' }}>{t.cancel}</button>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                        {b.status === 'EREEN_ARRIVED' && (
                          <button className="btn-ghost" onClick={() => startEdit(b)} style={{ fontSize: '0.78rem', padding: '0.35rem 0.9rem' }}>{t.edit}</button>
                        )}
                        <button className="btn-ghost" onClick={() => setLogOpen(logOpen === b.id ? null : b.id)} style={{ fontSize: '0.78rem', padding: '0.35rem 0.9rem' }}>{t.history}</button>
                      </div>
                    )}

                    {/* Track кодууд */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {b.shipments.map(s => (
                        <div key={s.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          fontSize: '0.8rem', fontFamily: 'monospace',
                          padding: '0.25rem 0.4rem', background: 'var(--surface)',
                          border: '1px solid var(--border)', borderRadius: 6,
                        }}>
                          {s.trackCode}
                          {editId === b.id && (
                            <button onClick={() => removeCode(b.id, s.id)} style={{
                              background: 'none', border: 'none', color: 'var(--danger)',
                              cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit',
                            }}>{t.remove}</button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Түүх (audit log) */}
                    {logOpen === b.id && (
                      <div style={{ marginTop: '0.6rem', borderTop: '1px dashed var(--border)', paddingTop: '0.5rem' }}>
                        {b.logs.map(l => (
                          <div key={l.id} style={{ fontSize: '0.72rem', color: 'var(--muted)', padding: '0.15rem 0' }}>
                            <strong style={{ color: 'var(--text)' }}>{l.userName}</strong> · {l.action}
                            {l.detail ? ` · ${l.detail}` : ''} · {new Date(l.createdAt).toLocaleString('mn-MN')}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

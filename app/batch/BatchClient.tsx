'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Currency = 'MNT' | 'CNY'

// Админ (монгол) болон Эрээний ажилтан (хятад) нэг хуудас хэрэглэдэг тул
// бүх шошго хоёр хэлээр зэрэг харагдана.
const T = {
  title: 'Багц бүртгэл · 批量登记',
  codes: 'Трак кодууд · 快递单号',
  codesPh: 'Код бүрийг шинэ мөрөнд бичнэ · 每行一个单号',
  codesHint: 'Enter — шинэ мөр. Сканнер ашиглаж болно · 按Enter换行，可用扫码枪',
  phone: 'Утасны дугаар · 电话号码',
  price: 'Нийт үнэ · 总价',
  note: 'Тайлбар · 备注',
  notePh: 'Заавал биш · 可选...',
  save: 'Бүртгэх · 登记',
  saving: 'Хадгалж байна · 保存中...',
  listTitle: 'Сүүлийн багцууд · 最近批次',
  items: 'ачаа · 件',
  empty: 'Багц бүртгэгдээгүй · 暂无批次',
  logout: 'Гарах · 退出',
  created: 'Бүртгэгдлээ · 登记成功',
  edit: 'Засах · 编辑',
  cancel: 'Болих · 取消',
  saveEdit: 'Хадгалах · 保存',
  addCodesPh: 'Нэмэх кодууд · 要添加的单号...',
  remove: 'Хасах · 移除',
  history: 'Түүх · 记录',
  confirmRemove: 'Энэ кодыг багцаас хасах уу? · 从批次中移除此单号？',
}

const STATUS_LABEL: Record<string, string> = {
  EREEN_ARRIVED: 'Эрээнд · 二连',
  ARRIVED: 'Ачигдсан · 已发出',
  PICKED_UP: 'Олгосон · 已取',
}

const HELP_MN = [
  'Нэг хэрэглэгчийн (нэг утасны дугаарын) ачаануудыг НЭГ багц болгон бүртгэнэ.',
  'Трак код талбарт кодуудыг мөр мөрөөр бичнэ — Enter дарж дараагийн мөрөнд шилжинэ. Сканнер ашиглаж болно. Энгийн дугаарлалт (1, 2, 3...) ч болно, гэхдээ давтагдахгүй байхаар (жш: 0705-1) дугаарлаарай.',
  'Утасны дугаар — хэрэглэгчийн 8 оронтой дугаар. Нийт үнэ — багцын бүх ачааны НИЙТ дүн юаниар (¥).',
  'Бүртгэх дармагц багц "УБ руу ачигдсан" төлөвтэй болж, хэрэглэгчид шууд харагдана.',
  'Алдаа гаргасан бол жагсаалтаас багцаа олоод Засах — утас, үнэ, тайлбар солих, код нэмэх/хасах боломжтой. Бүх засвар Түүхэнд бичигдэнэ.',
]

const HELP_CN = [
  '将同一个客户（同一个电话号码）的货物登记为一个批次。',
  '在单号栏中每行输入一个单号 — 按 Enter 换行。可以使用扫码枪。也可以用简单编号（1、2、3...），但请避免重复（例如：0705-1）。',
  '电话号码 — 客户的8位号码。总价 — 该批次所有货物的总金额（人民币 ¥）。',
  '点击登记后，批次状态变为"已发往UB"，客户立即可以看到。',
  '如有错误，在下方列表中找到批次点击编辑 — 可修改电话、价格、备注，添加/移除单号。所有修改都会记录在历史中。',
]

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
  const [isAdmin, setIsAdmin] = useState(false)
  const codesRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    load()
    // Админ орж ирсэн бол буцах линк харуулна (settings API зөвхөн админд нээлттэй)
    fetch('/api/admin/settings').then(r => { if (r.ok) setIsAdmin(true) }).catch(() => {})
  }, [])

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
      setMsg(`✓ ${T.created} — B-${data.id}`)
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
    if (!confirm(T.confirmRemove)) return
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div className="header-accent" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.7rem 5%', minHeight: 56, boxSizing: 'border-box',
        borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      }}>
        <span style={{ fontWeight: 800, fontSize: '0.92rem' }}>{T.title}</span>
        {isAdmin ? (
          <a href="/admin/batches" style={{ color: 'var(--muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
            ← Админ
          </a>
        ) : (
          <button onClick={logout} style={{
            background: 'none', border: 'none', color: 'var(--muted)',
            cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>{T.logout}</button>
        )}
      </div>

      <div className="page" style={{ maxWidth: 560 }}>
        {/* Заавар — хоёр хэлээр тусдаа */}
        <details style={{
          background: 'var(--accent-light)', border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)', marginBottom: '0.6rem', overflow: 'hidden',
        }}>
          <summary style={{ padding: '0.7rem 1rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)', listStyle: 'none' }}>
            ❓ Хэрхэн ажиллах заавар
          </summary>
          <ol style={{ margin: 0, padding: '0 1rem 0.9rem 2.2rem', fontSize: '0.8rem', color: 'var(--text)', lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {HELP_MN.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </details>
        <details style={{
          background: 'var(--accent-light)', border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)', marginBottom: '1rem', overflow: 'hidden',
        }}>
          <summary style={{ padding: '0.7rem 1rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)', listStyle: 'none' }}>
            ❓ 使用说明
          </summary>
          <ol style={{ margin: 0, padding: '0 1rem 0.9rem 2.2rem', fontSize: '0.8rem', color: 'var(--text)', lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {HELP_CN.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </details>

        {/* Бүртгэлийн форм */}
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div className="form-group">
            <label>{T.codes} {parsedCount > 0 && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>({parsedCount})</span>}</label>
            <textarea ref={codesRef} className="input" rows={6}
              placeholder={T.codesPh}
              value={codes} onChange={e => setCodes(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: '0.9rem' }} />
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.3rem' }}>{T.codesHint}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>{T.phone}</label>
              <input className="input" type="tel" placeholder="99001122" maxLength={8}
                value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>{T.price} (¥)</label>
              <input className="input" type="number" min="0" placeholder="0"
                value={price} onChange={e => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            <label>{T.note}</label>
            <input className="input" placeholder={T.notePh}
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
          {error && <p className="msg-error" style={{ marginTop: '0.75rem' }}>{error}</p>}
          {msg && <p style={{ color: 'var(--green)', fontSize: '0.85rem', marginTop: '0.75rem' }}>{msg}</p>}
          <button className="btn" onClick={save} disabled={!canSave || saving} style={{ width: '100%', marginTop: '1rem' }}>
            {saving ? T.saving : `${T.save}${parsedCount > 0 ? ` (${parsedCount})` : ''}`}
          </button>
        </div>

        {/* Багцын жагсаалт */}
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem' }}>{T.listTitle}</h2>
        {batches.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{T.empty}</p>
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
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{b.shipments.length} {T.items}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--muted)' }}>{b.phone}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <strong style={{ color: 'var(--accent)', fontSize: '0.88rem' }}>{fmtPrice(b.price, b.currency)}</strong>
                    <span className={`badge badge-${b.status}`} style={{ fontSize: '0.62rem' }}>{STATUS_LABEL[b.status] ?? b.status}</span>
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
                        <input className="input" placeholder={T.notePh} value={editNote}
                          onChange={e => setEditNote(e.target.value)}
                          style={{ marginBottom: '0.6rem' }} />
                        <textarea className="input" rows={2} placeholder={T.addCodesPh}
                          value={editAdd} onChange={e => setEditAdd(e.target.value)}
                          style={{ fontFamily: 'monospace', fontSize: '0.85rem', marginBottom: '0.6rem' }} />
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn" onClick={saveEdit} style={{ fontSize: '0.8rem', padding: '0.45rem 1rem' }}>{T.saveEdit}</button>
                          <button className="btn-ghost" onClick={() => setEditId(null)} style={{ fontSize: '0.8rem', padding: '0.45rem 1rem' }}>{T.cancel}</button>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                        {b.status === 'ARRIVED' && (
                          <button className="btn-ghost" onClick={() => startEdit(b)} style={{ fontSize: '0.78rem', padding: '0.35rem 0.9rem' }}>{T.edit}</button>
                        )}
                        <button className="btn-ghost" onClick={() => setLogOpen(logOpen === b.id ? null : b.id)} style={{ fontSize: '0.78rem', padding: '0.35rem 0.9rem' }}>{T.history}</button>
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
                              cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit',
                            }}>{T.remove}</button>
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

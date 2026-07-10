'use client'
import { useState, useEffect } from 'react'

interface BatchShipment { id: number; trackCode: string }
interface Batch {
  id: number; phone: string; price: string; currency: 'MNT' | 'CNY'
  note: string | null
  status: string; createdAt: string
  shipments: BatchShipment[]
}

const PAGE_SIZE = 20

function fmtPrice(price: string | number, currency: 'MNT' | 'CNY' = 'CNY') {
  const n = Number(price)
  return currency === 'CNY' ? `¥${n.toLocaleString()}` : `₮${n.toLocaleString()}`
}

function fmtDT(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear().toString().slice(2)}.${d.getMonth() + 1}.${d.getDate()}`
}

export default function BatchHandoverPage() {
  const [phone, setPhone] = useState('')
  const [batches, setBatches] = useState<Batch[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [done, setDone] = useState('')

  // Олгох боломжтой бүх багц (дугаараар бүлэглэж харуулна)
  const [overview, setOverview] = useState<Batch[]>([])
  const [ovLoading, setOvLoading] = useState(true)
  const [page, setPage] = useState(1)

  async function loadOverview() {
    setOvLoading(true)
    const res = await fetch('/api/batch?status=ARRIVED')
    if (res.ok) setOverview(await res.json())
    setOvLoading(false)
  }
  useEffect(() => { loadOverview() }, [])

  async function search(p?: string) {
    const ph = (p ?? phone).trim()
    if (!ph) return
    if (p) setPhone(p)
    setLoading(true)
    setDone('')
    const res = await fetch(`/api/batch?phone=${encodeURIComponent(ph)}&status=ARRIVED`)
    setLoading(false)
    if (res.ok) setBatches(await res.json())
  }

  function backToList() {
    setBatches(null)
    setPhone('')
    setDone('')
    loadOverview()
  }

  async function handover(b: Batch) {
    if (!confirm(`B-${b.id} багцын ${b.shipments.length} ачааг ${fmtPrice(b.price, b.currency)} дүнгээр ОЛГОХ уу?`)) return
    setBusy(b.id)
    const res = await fetch('/api/batch/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: b.id, status: 'PICKED_UP' }),
    })
    setBusy(null)
    if (res.ok) {
      setDone(`✓ B-${b.id} олгогдлоо — ${fmtPrice(b.price, b.currency)}`)
      setBatches(prev => prev?.filter(x => x.id !== b.id) ?? null)
      setOverview(prev => prev.filter(x => x.id !== b.id))
    }
  }

  // Дугаараар бүлэглэсэн нэгтгэл
  const groupMap = new Map<string, { phone: string; batchCount: number; itemCount: number; total: number }>()
  for (const b of overview) {
    const g = groupMap.get(b.phone) ?? { phone: b.phone, batchCount: 0, itemCount: 0, total: 0 }
    g.batchCount += 1
    g.itemCount += b.shipments.length
    g.total += Number(b.price)
    groupMap.set(b.phone, g)
  }
  const groups = Array.from(groupMap.values())
  const grandTotal = groups.reduce((s, g) => s + g.total, 0)
  const grandItems = groups.reduce((s, g) => s + g.itemCount, 0)
  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE))
  const pagedGroups = groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const searchTotal = (batches ?? []).reduce((s, b) => s + Number(b.price), 0)

  return (
    <div className="page-wide" style={{ maxWidth: 680 }}>
      <h1 className="section-title">Ачаа олгох</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.83rem', marginBottom: '0.9rem' }}>
        Утасны дугаараар хайж, УБ руу ачигдсан багцыг юанийн дүнгээр олгоно.
      </p>

      {/* Заавар */}
      <details style={{
        background: 'var(--accent-light)', border: '1px solid var(--accent)',
        borderRadius: 'var(--radius)', marginBottom: '1.25rem', overflow: 'hidden',
      }}>
        <summary style={{ padding: '0.7rem 1rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)', listStyle: 'none' }}>
          ❓ Хэрхэн олгох вэ
        </summary>
        <ol style={{ margin: 0, padding: '0 1rem 0.9rem 2.2rem', fontSize: '0.8rem', color: 'var(--text)', lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <li>Доорх жагсаалтад олгохоор хүлээгдэж буй бүх хэрэглэгч ачааны тоо, нийт ¥ дүнтэйгээ харагдана.</li>
          <li>Хэрэглэгч ирэхэд утасны дугаарыг нь хайх эсвэл жагсаалтаас дарна.</li>
          <li>Багц дээр дарж доторх кодуудыг ачаатай нь тулгаад, ¥ дүнг хүлээн авч &quot;Олгох&quot; дарна — багцын бүх ачаа зэрэг &quot;Олгосон&quot; болно.</li>
          <li>Андуурсан бол &quot;УБ руу ачигдсан&quot; хуудаснаас ↩ буцааж болно.</li>
        </ol>
      </details>

      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', maxWidth: 400 }}>
        <input
          className="input"
          placeholder="Утасны дугаар"
          value={phone}
          onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
          onKeyDown={e => e.key === 'Enter' && search()}
          autoFocus
        />
        <button className="btn" onClick={() => search()} disabled={loading || !phone.trim()} style={{ flexShrink: 0 }}>
          {loading ? '...' : 'Хайх'}
        </button>
      </div>

      {done && <p style={{ color: 'var(--green)', fontSize: '0.88rem', marginBottom: '1rem', fontWeight: 600 }}>{done}</p>}

      {batches === null ? (
        /* ── Олгох боломжтой дугааруудын жагсаалт ── */
        ovLoading ? (
          <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>
        ) : groups.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Олгохоор хүлээгдэж буй багц байхгүй байна.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
              <span style={{ fontSize: '0.8rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '0.2rem 0.75rem', color: 'var(--muted)' }}>
                {groups.length} хэрэглэгч
              </span>
              <span style={{ fontSize: '0.8rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '0.2rem 0.75rem', color: 'var(--muted)' }}>
                {grandItems} ачаа
              </span>
              <span style={{ fontSize: '0.8rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '0.2rem 0.75rem', color: 'var(--accent)', fontWeight: 700 }}>
                Нийт ¥{grandTotal.toLocaleString()}
              </span>
            </div>

            <div className="card" style={{ overflow: 'hidden' }}>
              {pagedGroups.map((g, i) => (
                <div
                  key={g.phone}
                  onClick={() => search(g.phone)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.65rem 1rem', gap: '0.5rem', cursor: 'pointer',
                    borderBottom: i < pagedGroups.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>{g.phone}</span>
                    <span style={{ fontSize: '0.76rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {g.itemCount} ачаа{g.batchCount > 1 ? ` · ${g.batchCount} багц` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                    <strong style={{ color: 'var(--accent)', fontSize: '0.92rem' }}>¥{g.total.toLocaleString()}</strong>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>›</span>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center', marginTop: '0.9rem' }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pageBtn(page === 1)}>‹</button>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)', padding: '0 0.5rem' }}>{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtn(page === totalPages)}>›</button>
              </div>
            )}
          </>
        )
      ) : (
        /* ── Сонгосон дугаарын багцууд ── */
        <>
          <button onClick={backToList} style={{
            background: 'none', border: 'none', color: 'var(--muted)',
            cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit',
            padding: 0, marginBottom: '0.9rem',
          }}>
            ← Бүх жагсаалт руу буцах
          </button>

          {batches.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Энэ дугаарт олгохоор хүлээгдэж буй багц алга.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
                <span style={{ fontSize: '0.8rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '0.2rem 0.75rem', color: 'var(--muted)' }}>
                  {batches.length} багц
                </span>
                <span style={{ fontSize: '0.8rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '0.2rem 0.75rem', color: 'var(--accent)', fontWeight: 700 }}>
                  Нийт ¥{searchTotal.toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {batches.map(b => (
                  <div key={b.id} className="card" style={{ overflow: 'hidden' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.75rem 1rem', gap: '0.5rem', flexWrap: 'wrap',
                    }}>
                      <div
                        onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', flex: 1, minWidth: 0 }}
                      >
                        <strong style={{ fontSize: '0.9rem' }}>B-{b.id}</strong>
                        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                          {b.shipments.length} ачаа · {fmtDT(b.createdAt)}{b.note ? ` · 💬 ${b.note}` : ''}
                        </span>
                        <span style={{
                          fontSize: '0.7rem', color: 'var(--muted)',
                          transform: expanded === b.id ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.15s', display: 'inline-block',
                        }}>▶</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                        <strong style={{ color: 'var(--accent)', fontSize: '1rem' }}>{fmtPrice(b.price, b.currency)}</strong>
                        <button className="btn" disabled={busy === b.id} onClick={() => handover(b)}
                          style={{ fontSize: '0.82rem', padding: '0.45rem 1.1rem' }}>
                          {busy === b.id ? '...' : 'Олгох'}
                        </button>
                      </div>
                    </div>
                    {expanded === b.id && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: '0.6rem 1rem', background: 'var(--bg)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.3rem' }}>
                          {b.shipments.map(s => (
                            <div key={s.id} style={{
                              fontSize: '0.78rem', fontFamily: 'monospace',
                              padding: '0.25rem 0.5rem', background: 'var(--surface)',
                              border: '1px solid var(--border)', borderRadius: 6,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {s.trackCode}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    height: 32, padding: '0 0.75rem', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--surface)', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1, fontSize: '0.82rem', color: 'var(--text)', fontFamily: 'inherit',
  }
}

'use client'
import { useState, useEffect } from 'react'

interface BatchShipment { id: number; trackCode: string }
interface BatchLog { id: number; userName: string; action: string; detail: string | null; createdAt: string }
interface Batch {
  id: number; phone: string; price: string; currency: 'MNT' | 'CNY'
  status: string; createdAt: string
  shipments: BatchShipment[]; logs: BatchLog[]
}

const STATUS_LABEL: Record<string, string> = {
  EREEN_ARRIVED: 'Эрээнд ирсэн', ARRIVED: 'Ирсэн', PICKED_UP: 'Олгосон',
}

function fmtPrice(price: string | number, currency: 'MNT' | 'CNY') {
  const n = Number(price)
  return currency === 'CNY' ? `¥${n.toLocaleString()}` : `₮${n.toLocaleString()}`
}

function fmtDT(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear().toString().slice(2)}.${d.getMonth() + 1}.${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function AdminBatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [logOpen, setLogOpen] = useState<number | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [tab, setTab] = useState<'ALL' | 'EREEN_ARRIVED' | 'ARRIVED' | 'PICKED_UP'>('ALL')

  function load() {
    fetch('/api/batch')
      .then(r => r.ok ? r.json() : [])
      .then(d => { setBatches(d); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function setStatus(id: number, status: string, confirmText: string) {
    if (!confirm(confirmText)) return
    setBusy(id)
    await fetch('/api/batch/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    setBusy(null)
    load()
  }

  async function removeBatch(id: number) {
    if (!confirm(`B-${id} багцыг устгах уу? Доторх ачаанууд багцаас салж хэвээр үлдэнэ.`)) return
    await fetch('/api/batch', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  const filtered = tab === 'ALL' ? batches : batches.filter(b => b.status === tab)
  const counts = batches.reduce<Record<string, number>>((a, b) => { a[b.status] = (a[b.status] ?? 0) + 1; return a }, {})

  return (
    <div className="page-wide" style={{ maxWidth: 760 }}>
      <h1 className="section-title">Багц ачаа</h1>

      {/* Статусын шүүлт */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {([['ALL', 'Бүгд'], ['EREEN_ARRIVED', 'Эрээнд'], ['ARRIVED', 'Ирсэн'], ['PICKED_UP', 'Олгосон']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '0.35rem 0.85rem', borderRadius: 100, border: '1px solid',
            fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            borderColor: tab === k ? 'var(--accent)' : 'var(--border)',
            background: tab === k ? 'var(--accent)' : 'var(--surface)',
            color: tab === k ? '#fff' : 'var(--muted)',
          }}>
            {label} ({k === 'ALL' ? batches.length : counts[k] ?? 0})
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Багц байхгүй байна.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {filtered.map(b => (
            <div key={b.id} className="card" style={{ overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.7rem 1rem', cursor: 'pointer', gap: '0.5rem', flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.88rem' }}>B-{b.id}</strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{b.shipments.length} ачаа</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent)' }}>{b.phone}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{fmtDT(b.createdAt)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <strong style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>{fmtPrice(b.price, b.currency)}</strong>
                  <span className={`badge badge-${b.status}`} style={{ fontSize: '0.65rem' }}>{STATUS_LABEL[b.status]}</span>
                </div>
              </div>

              {expanded === b.id && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '0.75rem 1rem', background: 'var(--bg)' }}>
                  {/* Үйлдлүүд */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                    {b.status === 'EREEN_ARRIVED' && (
                      <button className="btn" disabled={busy === b.id}
                        onClick={() => setStatus(b.id, 'ARRIVED', `B-${b.id} багцын ${b.shipments.length} ачааг бүгдийг ИРСЭН болгох уу?`)}
                        style={{ fontSize: '0.8rem', padding: '0.45rem 1rem' }}>
                        {busy === b.id ? '...' : '→ Ирсэн болгох'}
                      </button>
                    )}
                    {b.status === 'ARRIVED' && (
                      <>
                        <button className="btn" disabled={busy === b.id}
                          onClick={() => setStatus(b.id, 'PICKED_UP', `B-${b.id} багцыг бүхэлд нь ОЛГОСОН болгох уу? (${fmtPrice(b.price, b.currency)})`)}
                          style={{ fontSize: '0.8rem', padding: '0.45rem 1rem' }}>
                          {busy === b.id ? '...' : '→ Олгох'}
                        </button>
                        <button className="btn-ghost" disabled={busy === b.id}
                          onClick={() => setStatus(b.id, 'EREEN_ARRIVED', `B-${b.id} багцыг Эрээнд ирсэн төлөвт буцаах уу?`)}
                          style={{ fontSize: '0.8rem', padding: '0.45rem 1rem' }}>
                          ↩ Эрээнд буцаах
                        </button>
                      </>
                    )}
                    <button className="btn-ghost" onClick={() => setLogOpen(logOpen === b.id ? null : b.id)}
                      style={{ fontSize: '0.8rem', padding: '0.45rem 1rem' }}>
                      Түүх
                    </button>
                    {b.status !== 'PICKED_UP' && (
                      <button onClick={() => removeBatch(b.id)} style={{
                        background: 'none', border: '1px solid var(--danger)', borderRadius: 8,
                        color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem',
                        padding: '0.45rem 1rem', fontFamily: 'inherit',
                      }}>
                        Устгах
                      </button>
                    )}
                  </div>

                  {/* Track кодууд */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.3rem' }}>
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

                  {/* Audit log */}
                  {logOpen === b.id && (
                    <div style={{ marginTop: '0.75rem', borderTop: '1px dashed var(--border)', paddingTop: '0.5rem' }}>
                      {b.logs.map(l => (
                        <div key={l.id} style={{ fontSize: '0.74rem', color: 'var(--muted)', padding: '0.15rem 0' }}>
                          <strong style={{ color: 'var(--text)' }}>{l.userName}</strong> · {l.action}
                          {l.detail ? ` · ${l.detail}` : ''} · {fmtDT(l.createdAt)}
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
  )
}

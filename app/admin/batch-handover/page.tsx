'use client'
import { useState } from 'react'

interface BatchShipment { id: number; trackCode: string }
interface Batch {
  id: number; phone: string; price: string; currency: 'MNT' | 'CNY'
  status: string; createdAt: string
  shipments: BatchShipment[]
}

function fmtPrice(price: string | number, currency: 'MNT' | 'CNY') {
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

  async function search() {
    const p = phone.trim()
    if (!p) return
    setLoading(true)
    setDone('')
    const res = await fetch(`/api/batch?phone=${encodeURIComponent(p)}&status=ARRIVED`)
    setLoading(false)
    if (res.ok) setBatches(await res.json())
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
    }
  }

  const total = (batches ?? []).reduce((s, b) => s + Number(b.price), 0)

  return (
    <div className="page-wide" style={{ maxWidth: 620 }}>
      <h1 className="section-title">Ачаа олгох</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.83rem', marginBottom: '1.25rem' }}>
        Утасны дугаараар хайж, УБ руу ачигдсан багцыг юанийн дүнгээр олгоно.
      </p>

      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', maxWidth: 400 }}>
        <input
          className="input"
          placeholder="Утасны дугаар"
          value={phone}
          onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
          onKeyDown={e => e.key === 'Enter' && search()}
          autoFocus
        />
        <button className="btn" onClick={search} disabled={loading || !phone.trim()} style={{ flexShrink: 0 }}>
          {loading ? '...' : 'Хайх'}
        </button>
      </div>

      {done && <p style={{ color: 'var(--green)', fontSize: '0.88rem', marginBottom: '1rem', fontWeight: 600 }}>{done}</p>}

      {batches !== null && (
        batches.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Энэ дугаарт олгохоор хүлээгдэж буй багц алга.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
              <span style={{ fontSize: '0.8rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '0.2rem 0.75rem', color: 'var(--muted)' }}>
                {batches.length} багц
              </span>
              <span style={{ fontSize: '0.8rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '0.2rem 0.75rem', color: 'var(--accent)', fontWeight: 700 }}>
                Нийт ¥{total.toLocaleString()}
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
                      <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{b.shipments.length} ачаа · {fmtDT(b.createdAt)}</span>
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
        )
      )}
    </div>
  )
}

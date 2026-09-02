'use client'
import { useState, useEffect } from 'react'

interface LogItem {
  id: number
  userName: string
  action: string
  detail: string | null
  createdAt: string
}

const ACTION_LABELS: Record<string, string> = {
  'settings:update': 'Тохиргоо шинэчилсэн',
  'settings:permission-denied': '⚠ Эрхгүй талбар руу оролдсон',
  'staff-admin:create': 'Ажилтан admin үүсгэсэн',
  'staff-admin:permissions': 'Ажилтан admin-ы эрх өөрчилсөн',
  'staff-admin:reset-password': 'Ажилтан admin-ы нууц үг сольсон',
  'staff-admin:delete': 'Ажилтан admin устгасан',
  'ereen-staff:create': 'Эрээний ажилтан үүсгэсэн',
  'ereen-staff:reset-password': 'Эрээний ажилтны нууц үг сольсон',
  'ereen-staff:delete': 'Эрээний ажилтан устгасан',
  'shipment:register-arrived': 'Бараа ирсэн бүртгэсэн',
  'shipment:revert-arrived': 'Ирсэн бараа буцаасан',
  'shipment:handover': 'Бараа олгосон',
  'shipment:revert-pickup': 'Олгосон бараа буцаасан',
}

function fmtDT(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear().toString().slice(2)}.${d.getMonth() + 1}.${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function AuditLogClient() {
  const [items, setItems] = useState<LogItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 30

  function load(pg: number) {
    setLoading(true)
    fetch(`/api/admin/audit-log?page=${pg}`)
      .then(r => r.ok ? r.json() : { items: [], total: 0 })
      .then(d => { setItems(d.items); setTotal(d.total) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load(page) }, [page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="page-wide" style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <h1 className="section-title" style={{ margin: 0 }}>Аудит лог</h1>
        <span style={{ fontSize: '0.78rem', color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.2rem 0.75rem' }}>
          Нийт <strong style={{ color: 'var(--text)' }}>{total}</strong>
        </span>
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
        Тохиргоо, ажилтны эрх, бараа бүртгэх/олгох/буцаах зэрэг чухал үйлдлүүдийн түүх — зөвхөн танд харагдана.
      </p>

      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Ачааллаж байна...</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Түүх хоосон байна.</p>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {items.map((l, i) => (
            <div key={l.id} style={{
              padding: '0.65rem 1rem',
              borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
              fontSize: '0.83rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                <span>
                  <strong>{l.userName}</strong>
                  <span style={{ color: 'var(--muted)' }}> · {ACTION_LABELS[l.action] ?? l.action}</span>
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'monospace', flexShrink: 0 }}>{fmtDT(l.createdAt)}</span>
              </div>
              {l.detail && <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.2rem' }}>{l.detail}</p>}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', alignItems: 'center', marginTop: '1rem' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pgBtn}>‹</button>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)', padding: '0 0.4rem' }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pgBtn}>›</button>
        </div>
      )}
    </div>
  )
}

const pgBtn: React.CSSProperties = {
  padding: '0.3rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer',
  fontSize: '0.82rem', fontFamily: 'inherit',
}

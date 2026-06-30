'use client'
import { useEffect, useState } from 'react'

interface Row {
  cargoId: number
  name: string
  total: number
  last30: number
  unread: number
}

interface Stats {
  rows: Row[]
  grandTotal: number
  grandLast30: number
}

interface RecentNotif {
  id: number
  cargoId: number
  cargoName: string
  body: string
  read: boolean
  createdAt: string
}

export default function CrossCargoPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<RecentNotif[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/super/cross-cargo-stats').then(r => r.json()),
      fetch('/api/super/cross-cargo-recent').then(r => r.json()),
    ])
      .then(([s, r]) => { setStats(s); setRecent(r) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>

  return (
    <>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="section-title" style={{ margin: 0 }}>Карго зөрүүгийн статистик</h1>
        {stats && (
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.3rem' }}>
            Нийт {stats.grandTotal} мэдэгдэл · Сүүлийн 30 хоног: {stats.grandLast30}
          </p>
        )}
      </div>

      {/* Per-cargo summary */}
      {stats && stats.rows.length > 0 ? (
        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '2rem' }}>
          {stats.rows.map(r => (
            <div key={r.cargoId} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.75rem 1rem', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{r.name}</span>
              <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{r.total}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: '0.15rem' }}>нийт</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: r.last30 > 0 ? 'var(--accent)' : 'var(--muted)', lineHeight: 1 }}>{r.last30}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: '0.15rem' }}>30 хоног</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: r.unread > 0 ? '#e05070' : 'var(--muted)', lineHeight: 1 }}>{r.unread}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: '0.15rem' }}>уншаагүй</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>Карго зөрүүгийн мэдэгдэл байхгүй байна.</p>
      )}

      {/* Recent notifications */}
      {recent.length > 0 && (
        <>
          <h2 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
            Сүүлийн 50 мэдэгдэл
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {recent.map(n => (
              <div key={n.id} style={{
                padding: '0.65rem 1rem',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderLeft: n.read ? '3px solid var(--border)' : '3px solid #e05070',
                borderRadius: 'var(--radius)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)' }}>{n.cargoName}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                    {new Date(n.createdAt).toLocaleDateString('mn-MN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text)', margin: 0 }}>{n.body}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

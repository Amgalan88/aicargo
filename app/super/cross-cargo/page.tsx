'use client'
import { useEffect, useState } from 'react'

// Нэг группийн каргонуудын хооронд холилдсон ачаа: нэг каргоны хэрэглэгчийн ачаа өөр каргод бүртгэгдсэн тохиолдол
interface Row { cargoId: number; name: string; total: number; last30: number; unread: number }
interface Stats { rows: Row[]; grandTotal: number; grandLast30: number }
interface RecentNotif { id: number; cargoId: number; cargoName: string; body: string; read: boolean; createdAt: string }

const dt = (s: string) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` }

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
    <div className="xc">
      <h1 className="section-title" style={{ margin: 0 }}>Холилдсон ачаа</h1>
      <p className="xc-sub">
        Нэг группийн нэг каргоны хэрэглэгчийн ачаа өөр каргод бүртгэгдэхэд хоёр каргод хоёуланд нь мэдэгдэл очдог.
        {stats && <> Нийт <b>{stats.grandTotal}</b> · сүүлийн 30 хоногт <b>{stats.grandLast30}</b>.</>}
      </p>

      {stats && stats.rows.length > 0 ? (
        <div className="card xc-table">
          <div className="xc-tr xc-th"><span>Карго</span><span>Нийт</span><span>30 хоног</span><span>Уншаагүй</span></div>
          {stats.rows.map(r => (
            <div key={r.cargoId} className="xc-tr">
              <span className="xc-name">{r.name}</span>
              <span>{r.total}</span>
              <span className={r.last30 ? 'xc-hot' : ''}>{r.last30}</span>
              <span className={r.unread ? 'xc-warn' : ''}>{r.unread}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--muted)' }}>Холилдсон ачаа алга.</p>
      )}

      {recent.length > 0 && (
        <>
          <h2 className="xc-h2">Сүүлийн мэдэгдлүүд</h2>
          <div className="card xc-list">
            {recent.map(n => (
              <div key={n.id} className={`xc-item${n.read ? '' : ' unread'}`}>
                <span className="xc-time">{dt(n.createdAt)}</span>
                <b>{n.cargoName}</b>
                <span className="xc-body">{n.body}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

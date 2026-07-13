'use client'
import { useEffect, useState } from 'react'

interface SuperBanner {
  id: number
  content: string
  imageUrl: string | null
  expiresAt: string | null
}

// endpoint: 'admin' (default) — админд, 'user' — хэрэглэгчид зориулсан баннер
export default function SuperAnnouncementModal({ endpoint = 'admin' }: { endpoint?: 'admin' | 'user' }) {
  const [banner, setBanner] = useState<SuperBanner | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    fetch(`/api/${endpoint}/super-banner`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) { setBanner(data); setVisible(true) }
      })
      .catch(() => {})
  }, [endpoint])

  async function dismiss() {
    if (!banner) return
    setVisible(false)
    fetch(`/api/${endpoint}/super-banner/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ superBannerId: banner.id }),
    }).catch(() => {})
  }

  if (!visible || !banner) return null

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 9100,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          padding: '1.75rem 1.5rem 1.5rem',
          maxWidth: 420, width: '100%',
          boxShadow: '0 8px 40px rgba(0,0,0,0.28)',
          border: '1px solid var(--accent)',
          position: 'relative',
        }}
      >
        <div style={{
          position: 'absolute', top: '-1px', left: '1.5rem',
          background: 'var(--accent)', color: '#fff',
          fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em',
          padding: '0.15rem 0.7rem', borderRadius: '0 0 6px 6px',
          textTransform: 'uppercase',
        }}>
          Системийн мэдэгдэл
        </div>

        <button
          onClick={dismiss}
          aria-label="Хаах"
          style={{
            position: 'absolute', top: '0.75rem', right: '0.75rem',
            background: 'var(--surface2)', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', borderRadius: '50%',
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.9rem',
          }}
        >✕</button>

        {banner.imageUrl && (
          <img
            src={banner.imageUrl}
            alt=""
            style={{ width: '100%', borderRadius: 10, marginBottom: '1rem', maxHeight: 240, objectFit: 'cover' }}
          />
        )}

        <p style={{
          fontSize: '0.95rem', lineHeight: 1.65, color: 'var(--text)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: '0.5rem',
        }}>
          {banner.content}
        </p>

        {banner.expiresAt && (
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.75rem' }}>
            {new Date(banner.expiresAt).toLocaleString('mn-MN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} хүртэл
          </p>
        )}

        <button onClick={dismiss} className="btn" style={{ marginTop: '1.25rem', width: '100%' }}>
          Ойлголоо
        </button>
      </div>
    </div>
  )
}

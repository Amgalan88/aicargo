'use client'
import { useEffect, useState } from 'react'

interface Banner {
  id: number
  content: string
  imageUrl: string | null
  expiresAt: string | null
}

export default function AnnouncementModal() {
  const [banner, setBanner] = useState<Banner | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    fetch('/api/banner')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) { setBanner(data); setVisible(true) }
      })
      .catch(() => {})
  }, [])

  async function dismiss() {
    if (!banner) return
    setVisible(false)
    fetch('/api/banner/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bannerId: banner.id }),
    }).catch(() => {})
  }

  if (!visible || !banner) return null

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.55)',
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
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
          border: '1px solid var(--border)',
          position: 'relative',
        }}
      >
        <button
          onClick={dismiss}
          aria-label="Хаах"
          style={{
            position: 'absolute', top: '0.75rem', right: '0.75rem',
            background: 'var(--surface2)', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', borderRadius: '50%',
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.9rem', lineHeight: 1,
          }}
        >✕</button>

        {banner.imageUrl && (
          <img
            src={banner.imageUrl}
            alt=""
            style={{
              width: '100%', borderRadius: 10, marginBottom: '1rem',
              maxHeight: 240, objectFit: 'cover',
            }}
          />
        )}

        <p style={{
          fontSize: '0.95rem', lineHeight: 1.65, color: 'var(--text)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {banner.content}
        </p>

        {banner.expiresAt && (
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.75rem' }}>
            {new Date(banner.expiresAt).toLocaleString('mn-MN', {
              month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })} хүртэл
          </p>
        )}

        <button
          onClick={dismiss}
          className="btn"
          style={{ marginTop: '1.25rem', width: '100%' }}
        >
          Ойлголоо
        </button>
      </div>
    </div>
  )
}

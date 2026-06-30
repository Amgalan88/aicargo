'use client'
import { useState } from 'react'

interface Faq { id: number; question: string; answer: string }

function renderAnswer(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/).map((part, i) =>
    part.match(/^https?:\/\//) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer"
        style={{ color: 'var(--accent)', wordBreak: 'break-all', textDecoration: 'underline' }}>
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export default function ChatWidget({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [faqs, setFaqs] = useState<Faq[]>([])
  const [selected, setSelected] = useState<Faq | null>(null)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    if (loaded) return
    const res = await fetch('/api/faq')
    if (res.ok) { setFaqs(await res.json()); setLoaded(true) }
  }

  if (!open) return null
  if (!loaded && faqs.length === 0) load()

  return (
    <div style={{
      position: 'fixed', top: '3.5rem', right: '1rem', zIndex: 1000,
      width: 272, maxHeight: 360, display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '12px', boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.6rem 0.85rem', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--surface2)',
      }}>
        {selected ? (
          <button onClick={() => setSelected(null)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', fontSize: '0.78rem', fontFamily: 'inherit', padding: 0,
          }}>← Буцах</button>
        ) : (
          <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text)' }}>Түгээмэл асуултууд</span>
        )}
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1, padding: '0.1rem 0.2rem',
        }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.6rem' }}>
        {selected ? (
          <div>
            <p style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.45rem', lineHeight: 1.4, color: 'var(--text)' }}>{selected.question}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.6 }}>{renderAnswer(selected.answer)}</p>
          </div>
        ) : faqs.length === 0 ? (
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center', padding: '0.8rem 0' }}>
            {loaded ? 'Асуулт байхгүй байна.' : '...'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {faqs.map(f => (
              <button key={f.id} onClick={() => setSelected(f)} style={{
                textAlign: 'left', padding: '0.5rem 0.7rem',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: '8px', cursor: 'pointer', fontSize: '0.79rem',
                color: 'var(--text)', fontFamily: 'inherit', lineHeight: 1.4,
                transition: 'border-color 0.12s',
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                {f.question}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

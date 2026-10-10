'use client'
import { useEffect, useState } from 'react'
import type { EreenAddress } from '@/lib/ereen-address'

// Хэрэглэгчид харагдах Эрээний хаяг (нүүр хуудас, "Миний ачаа"-ны доод хэсэг).
// Хэд хэдэн хаягтай бол дээр нь нэрээр сонгоно (жш: Жижиглэн ачаа | Бөөн ачаа); нэг хаягтай бол урьдын адил.

function CopyItem({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.7rem 0', borderBottom: '1px solid var(--border)', gap: '1rem',
    }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 500, overflowWrap: 'anywhere' }}>{value}</span>
        <button onClick={copy} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: copied ? 'var(--green)' : 'var(--muted)',
          fontSize: '0.72rem', fontFamily: 'inherit', fontWeight: 600,
          padding: '0.15rem 0.4rem', borderRadius: '4px',
          transition: 'color 0.15s', flexShrink: 0,
        }}>
          {copied ? '✓' : 'Хуулах'}
        </button>
      </div>
    </div>
  )
}

function Region({ value }: { value: string }) {
  const parts = value.split('·').map(s => s.trim()).filter(Boolean)
  if (!parts.length) return null
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.7rem 0', borderBottom: '1px solid var(--border)', gap: '1rem',
    }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--muted)', flexShrink: 0 }}>地区 (Бүс)</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {parts.map((part, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{
              fontSize: '0.78rem', fontWeight: 500,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '5px', padding: '0.2rem 0.5rem', color: 'var(--text)',
            }}>{part}</span>
            {i < parts.length - 1 && <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>›</span>}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function EreenAddresses({ addresses, storageKey }: { addresses: EreenAddress[]; storageKey?: string }) {
  const [idx, setIdx] = useState(0)
  // Сүүлд сонгосон хаягийг энэ төхөөрөмж дээр санана
  const key = storageKey ? `ereen-address:${storageKey}` : null
  useEffect(() => {
    if (!key) return
    try {
      const v = Number(localStorage.getItem(key))
      if (Number.isInteger(v) && v > 0 && v < addresses.length) setIdx(v)
    } catch {}
  }, [key, addresses.length])
  function pick(i: number) {
    setIdx(i)
    if (key) try { localStorage.setItem(key, String(i)) } catch {}
  }

  const a = addresses[Math.min(idx, addresses.length - 1)]
  if (!a) return null
  return (
    <>
      {addresses.length > 1 && (
        <div role="tablist" aria-label="Эрээний хаяг" style={{
          display: 'flex', gap: 3, padding: 3, marginBottom: '0.6rem',
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          {addresses.map((x, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === idx}
              onClick={() => pick(i)}
              style={{
                flex: 1, minWidth: 0, padding: '0.45rem 0.5rem', border: 'none', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: i === idx ? 700 : 500,
                background: i === idx ? 'var(--surface)' : 'transparent',
                color: i === idx ? 'var(--accent)' : 'var(--muted)',
                boxShadow: i === idx ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {x.name || `Хаяг ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <CopyItem label="收货人 (Нэр)" value={a.receiver} />
        <CopyItem label="手机号 (Утас)" value={a.phone} />
        {a.region && <Region value={a.region} />}
        <CopyItem label="详细地址 (Хаяг)" value={a.address} />
      </div>
    </>
  )
}

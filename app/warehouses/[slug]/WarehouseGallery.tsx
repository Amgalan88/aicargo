'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { WAREHOUSE_IMAGE_CATEGORIES, categoryLabel, cloudinaryThumb } from '@/lib/warehouse'

export interface PublicImage {
  id: number
  url: string
  caption: string | null
  category: string
}

export default function WarehouseGallery({ images, name }: { images: PublicImage[]; name: string }) {
  const [filter, setFilter] = useState<string>('ALL')
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const touchX = useRef<number | null>(null)

  const tabs = useMemo(
    () => WAREHOUSE_IMAGE_CATEGORIES.filter(c => images.some(i => i.category === c.value)),
    [images],
  )
  const shown = filter === 'ALL' ? images : images.filter(i => i.category === filter)

  function nav(dir: -1 | 1) {
    setOpenIdx(i => i === null ? i : (i + dir + shown.length) % shown.length)
  }

  useEffect(() => {
    if (openIdx === null) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenIdx(null)
      else if (e.key === 'ArrowRight') nav(1)
      else if (e.key === 'ArrowLeft') nav(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIdx === null, shown.length])

  if (images.length === 0) {
    return (
      <div style={{
        padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)',
        background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)',
        fontSize: '0.85rem',
      }}>
        Зураг удахгүй нэмэгдэнэ
      </div>
    )
  }

  const current = openIdx !== null ? shown[openIdx] : null

  return (
    <>
      {tabs.length > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
          <Tab active={filter === 'ALL'} onClick={() => setFilter('ALL')}>Бүгд ({images.length})</Tab>
          {tabs.map(t => (
            <Tab key={t.value} active={filter === t.value} onClick={() => setFilter(t.value)}>
              {t.label} ({images.filter(i => i.category === t.value).length})
            </Tab>
          ))}
        </div>
      )}

      <style>{`
        .wh-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.6rem; }
        @media (max-width: 600px) { .wh-gallery { grid-template-columns: 1fr 1fr; gap: 0.4rem; } }
        .wh-thumb { position: relative; padding: 0; border: none; background: var(--surface2); border-radius: 10px; overflow: hidden; cursor: zoom-in; }
        .wh-thumb img { width: 100%; aspect-ratio: 3 / 2; object-fit: cover; display: block; transition: transform 0.25s; }
        .wh-thumb:hover img { transform: scale(1.04); }
        .wh-thumb-cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 1rem 0.55rem 0.4rem; font-size: 0.72rem; color: #fff; text-align: left;
          background: linear-gradient(transparent, rgba(0,0,0,0.65)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      `}</style>
      <div className="wh-gallery">
        {shown.map((img, i) => (
          <button key={img.id} className="wh-thumb" onClick={() => setOpenIdx(i)}
            aria-label={img.caption ?? `${name} — зураг ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cloudinaryThumb(img.url, 480)} alt={img.caption ?? name} loading="lazy" />
            {img.caption && <span className="wh-thumb-cap">{img.caption}</span>}
          </button>
        ))}
      </div>

      {current && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenIdx(null)}
          onTouchStart={e => { touchX.current = e.touches[0].clientX }}
          onTouchEnd={e => {
            if (touchX.current === null) return
            const dx = e.changedTouches[0].clientX - touchX.current
            touchX.current = null
            if (dx < -40) nav(1)
            else if (dx > 40) nav(-1)
          }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '1rem', touchAction: 'none',
          }}
        >
          <button onClick={() => setOpenIdx(null)} aria-label="Хаах" style={{ ...lbBtn, top: 'calc(12px + env(safe-area-inset-top))', right: 14 }}>✕</button>
          {shown.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); nav(-1) }} aria-label="Өмнөх" style={{ ...lbBtn, left: 10, top: '50%', transform: 'translateY(-50%)' }}>‹</button>
              <button onClick={e => { e.stopPropagation(); nav(1) }} aria-label="Дараах" style={{ ...lbBtn, right: 10, top: '50%', transform: 'translateY(-50%)' }}>›</button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt={current.caption ?? name}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8 }} />
          <div style={{ color: '#fff', fontSize: '0.82rem', marginTop: '0.75rem', textAlign: 'center' }}>
            {current.caption && <div style={{ fontWeight: 600, marginBottom: 2 }}>{current.caption}</div>}
            <span style={{ opacity: 0.7 }}>{categoryLabel(current.category)} · {openIdx! + 1} / {shown.length}</span>
          </div>
        </div>
      )}
    </>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      background: active ? 'var(--accent-light)' : 'var(--surface)',
      color: active ? 'var(--accent)' : 'var(--text)',
      borderRadius: 100, padding: '0.3rem 0.8rem', fontSize: '0.78rem', fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit',
    }}>
      {children}
    </button>
  )
}

const lbBtn: React.CSSProperties = {
  position: 'absolute', background: 'rgba(255,255,255,0.14)', border: 'none', color: '#fff',
  borderRadius: '50%', width: 42, height: 42, cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
}

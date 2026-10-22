'use client'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { cloudinaryLogoH } from '@/lib/warehouse'

// Тэгш өнцөгт лого (өргөн ≥ 1.3 × өндөр) — салбарын лого шиг нэр нь дотроо бичигдсэн байдаг тул
// дөрвөлжин хайрцагт тайрахгүй, бүтнээр нь, нэрийн бичвэргүй харуулна.
// Нэг мөр (≥ 2:1) — 40px өндөр; хоёр мөр (жш „MGL КАРГО / КИНО ҮЙЛДВЭР салбар“) — 44px, доод мөр уншигдана.
// Харьцааг зураг ачаалагдахад хэмжиж localStorage-д санана — дахин ороход шууд.
const WIDE_RATIO = 1.3
const ratioKey = (url: string) => `logo-ratio:${url}`

export default function NavLogo({ name, logoUrl }: { name?: string; logoUrl?: string }) {
  const [ratio, setRatio] = useState<number | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const measure = (img: HTMLImageElement | null) => {
    if (!img || !logoUrl || !img.naturalWidth || !img.naturalHeight) return
    const r = Math.round((img.naturalWidth / img.naturalHeight) * 100) / 100
    setRatio(r)
    try { localStorage.setItem(ratioKey(logoUrl), String(r)) } catch {}
  }

  useEffect(() => {
    if (!logoUrl) return
    try { const v = Number(localStorage.getItem(ratioKey(logoUrl))); if (v > 0) setRatio(v) } catch {}
    // Hydration-аас өмнө (кэшээс) ачаалагдсан бол onLoad дуудагдахгүй
    if (imgRef.current?.complete) measure(imgRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoUrl])

  if (logoUrl && ratio !== null && ratio >= WIDE_RATIO) {
    return (
      // Толгойн товчнуудтай давхцахгүй: байгаа зайд багтаж жижигэрнэ (flex shrink + max-width 100%)
      <span className="navlogo-wide" style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: '0 1 auto', maxWidth: 320, marginRight: '0.75rem' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cloudinaryLogoH(logoUrl, 44)} alt={name ?? 'logo'}
          style={{ height: ratio >= 2 ? 40 : 44, width: 'auto', maxWidth: '100%', minWidth: 0, objectFit: 'contain', objectPosition: 'left center', display: 'block' }} />
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, overflow: 'hidden' }}>
      <span style={{
        width: 34, height: 34, borderRadius: 9,
        background: 'var(--accent-light)', border: '1px solid var(--border)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, overflow: 'hidden', boxSizing: 'border-box',
      }}>
        {logoUrl ? (
          // Харьцааг хэмжихийн тулд тайралгүй (c_limit) татаж, хайрцагт cover-оор багтаана
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={imgRef} src={cloudinaryLogoH(logoUrl, 34)} alt="logo" width={34} height={34}
            onLoad={e => measure(e.currentTarget)}
            style={{ objectFit: 'cover', width: '100%', height: '100%', display: 'block' }} />
        ) : (
          <Image src="/logo.svg" alt="logo" width={22} height={22} priority style={{ display: 'block' }} />
        )}
      </span>
      <span className="navlogo-name" style={{
        fontSize: name ? '0.92rem' : '1.05rem',
        fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: 'var(--text)',
      }}>
        {name ?? 'AiCargo'}
      </span>
    </span>
  )
}

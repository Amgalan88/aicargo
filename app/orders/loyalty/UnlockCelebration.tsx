'use client'
import { useEffect, useRef } from 'react'
import { useReducedMotion } from './useReducedMotion'

// «Баяр хүргэе!» — VIP шат нээгдэхэд нэг удаа (v1-тэй ижил: overlay 220ms, медаль 620ms, туяа 1.8s, confetti 3 burst).
// Хөдөлгөөн багасгавал confetti-гүй, хөдөлгөөнгүй цонх. Esc / дэвсгэр / товч хаана; хаахад өмнөх focus руу буцна.
export default function UnlockCelebration({ pct, onClose }: { pct: number; onClose: () => void }) {
  const btn = useRef<HTMLButtonElement>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    btn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') { e.preventDefault(); btn.current?.focus() } // цонхонд ганц товч — focus энд үлдэнэ
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [onClose])
  useEffect(() => {
    if (reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let cancelled = false
    const timers: number[] = []
    import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled) return
      const cs = getComputedStyle(document.documentElement)
      const colors = [cs.getPropertyValue('--accent').trim() || '#b4532f', cs.getPropertyValue('--lh-gold').trim() || '#b4532f', '#ffffff', '#15803d']
      const base = { colors, zIndex: 70, disableForReducedMotion: true }
      confetti({ ...base, particleCount: 90, spread: 70, startVelocity: 42, origin: { y: 0.42 } })
      timers.push(window.setTimeout(() => confetti({ ...base, particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.6 } }), 220))
      timers.push(window.setTimeout(() => confetti({ ...base, particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.6 } }), 380))
    }).catch(() => { /* confetti-гүй ч цонх ажиллана */ })
    return () => { cancelled = true; timers.forEach(clearTimeout) }
  }, [reduced])
  return (
    <div className="lh-ovl show" role="dialog" aria-modal="true" aria-labelledby="lh-ovl-t" data-testid="lh-unlock" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="lh-pop">
        <div className="lh-medal" aria-hidden><small>VIP</small><b>{pct}%</b></div>
        <h2 id="lh-ovl-t">Баяр хүргэе!</h2>
        <p>Та <b>VIP {pct}%</b> шатанд хүрлээ. Цаашид ачаагаа авах бүрт <b>{pct}% хөнгөлөлт</b> автоматаар тооцогдоно.</p>
        <button ref={btn} className="btn lh-cta" type="button" onClick={onClose} style={{ width: '100%', minHeight: 48 }}>Гоё!</button>
      </div>
    </div>
  )
}

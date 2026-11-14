'use client'
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './useReducedMotion'

// 800ms easeOutCubic — өмнөх утгаас (анх 0-ээс) шинэ утга руу. Хөдөлгөөн багасгавал шууд.
export function useCountUp(target: number, ms = 800): number {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(target)
  const from = useRef(0)
  useEffect(() => {
    const start = from.current
    from.current = target
    if (reduced || start === target) { setShown(target); return }
    let raf = 0
    const t0 = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      setShown(start + (target - start) * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms, reduced])
  return shown
}

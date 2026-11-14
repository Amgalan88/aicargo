'use client'
import { motion, useInView, useMotionValue, useSpring } from 'framer-motion'
import { useEffect, useRef, useState, ReactNode } from 'react'

/* ── Хөдөлгөөнгүй горим. SSR болон эхний render false — дараа нь сонсогч шинэчилнэ. ── */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/* ── Scroll-reveal wrapper ── */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  once = true,
  className,
  style,
}: {
  children: ReactNode
  delay?: number
  y?: number
  once?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const reduce = usePrefersReducedMotion()
  if (reduce) return <div className={className} style={style}>{children}</div>
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-40px' }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/* ── Stagger container ── */
export function Stagger({
  children,
  className,
  style,
  gap = 0.07,
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  gap?: number
}) {
  const reduce = usePrefersReducedMotion()
  if (reduce) return <div className={className} style={style}>{children}</div>
  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-30px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const reduce = usePrefersReducedMotion()
  if (reduce) return <div className={className} style={style}>{children}</div>
  return (
    <motion.div
      className={className}
      style={style}
      variants={{
        hidden: { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      {children}
    </motion.div>
  )
}

/* ── Тоолуур — 0-ээс target хүртэл тоолно ── */
export function AnimatedNumber({
  value,
  duration = 1.4,
  suffix = '',
  className,
  style,
}: {
  value: number
  duration?: number
  suffix?: string
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = usePrefersReducedMotion()
  const inView = useInView(ref, { once: true, margin: '-20px' })
  const finalText = Math.round(value).toLocaleString('en-US') + suffix

  useEffect(() => {
    const el = ref.current
    if (!el || reduce || !inView) return
    let raf = 0
    const from = value * 0.85
    const t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / (duration * 1000))
      const eased = 1 - Math.pow(1 - k, 3)
      el.textContent = Math.round(from + (value - from) * eased).toLocaleString('en-US') + suffix
      if (k < 1) raf = requestAnimationFrame(step)
      else el.textContent = finalText
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [inView, reduce, value, suffix, duration, finalText])

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {finalText}
    </span>
  )
}

/* ── 3D tilt card — mouse дагаж нална (зөөлөн) ── */
export function TiltCard({
  children,
  className,
  style,
  max = 6,
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  max?: number
}) {
  const reduce = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const srx = useSpring(rx, { stiffness: 200, damping: 20 })
  const sry = useSpring(ry, { stiffness: 200, damping: 20 })

  function onMove(e: React.MouseEvent) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    ry.set(px * max)
    rx.set(-py * max)
  }
  function onLeave() {
    rx.set(0)
    ry.set(0)
  }

  if (reduce) return <div className={className} style={style}>{children}</div>
  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ transformStyle: 'preserve-3d', perspective: 800, rotateX: srx, rotateY: sry, ...style }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {children}
    </motion.div>
  )
}

/* ── Нүүрний статистик: SSR-д бодит тоо (0 биш), харагдах үед л 80%-аас тоолно (UX аудит #10) ──
   JS ачаалагдаагүй/screenshot/SEO/удаан утсанд бодит тоо харагдана. prefers-reduced-motion үед тоолохгүй. */
export function CountUpStat({ value, suffix = '', duration = 1.1, from = 0.8 }: { value: number; suffix?: string; duration?: number; from?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const fmt = (v: number) => Math.round(v).toLocaleString('en-US') + suffix
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return
      io.disconnect()
      const start = value * from, t0 = performance.now()
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / (duration * 1000))
        el.textContent = fmt(start + (value - start) * (1 - Math.pow(1 - k, 3)))
        if (k < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, { threshold: 0.4 })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, suffix, duration, from])
  return <span ref={ref} data-testid="count-up" data-value={value}>{fmt(value)}</span>
}

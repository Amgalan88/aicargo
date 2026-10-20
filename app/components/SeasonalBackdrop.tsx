'use client'
import { useEffect, useRef } from 'react'

// Нүүр хуудасны дээд хэсгийн бүдэг улирлын дэвсгэр (calm-app-kit-ийн зарчмаар):
//   9–11 сар 🍂 навч · 12–2 ❄️ цас · 3–8 ☀️ гэрлийн тоосонцор.
// Агуулгын АРД (z-index: -1, .lp-д дэвсгэр байхгүй тул body-ийн өнгөн дээр зурагдана), товшилт саадгүй.
// ~30 fps, devicePixelRatio ≤ 1.5, бөөмсийн тоо талбайгаар; табыг нуух эсвэл дэлгэцээс гарахад зогсоно;
// prefers-reduced-motion үед огт зурахгүй.

type Kind = 'leaf' | 'snow' | 'mote'
interface P { x: number; y: number; r: number; vx: number; vy: number; a: number; rot: number; vr: number; phase: number; hue: number }

const kindByMonth = (m: number): Kind => (m >= 8 && m <= 10 ? 'leaf' : m === 11 || m <= 1 ? 'snow' : 'mote')

// Сэдэв бүрт бөөмсийн өнгө (бичвэр дээгүүр өнгөрөх тул бүдэг)
function palette(kind: Kind, theme: string | undefined): string[] {
  const night = theme === 'night'
  if (kind === 'leaf') return night ? ['217,122,83', '201,150,70', '170,95,60'] : ['180,83,47', '201,140,60', '160,110,50']
  if (kind === 'snow') return night ? ['236,231,223'] : ['130,145,170']
  return night ? ['240,200,140'] : ['200,140,70']
}

export default function SeasonalBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const kind = kindByMonth(new Date().getMonth())
    let parts: P[] = []
    let w = 0, h = 0, raf = 0, last = 0, visible = true

    const spawn = (anyY: boolean): P => {
      const r = kind === 'leaf' ? 5 + Math.random() * 6 : kind === 'snow' ? 1.2 + Math.random() * 2.4 : 1 + Math.random() * 2
      return {
        x: Math.random() * w,
        y: anyY ? Math.random() * h : kind === 'mote' ? h + 10 : -15,
        r,
        vx: (Math.random() - 0.5) * (kind === 'leaf' ? 0.5 : 0.25),
        vy: kind === 'leaf' ? 0.35 + Math.random() * 0.45 : kind === 'snow' ? 0.3 + Math.random() * 0.5 : -(0.12 + Math.random() * 0.2),
        a: kind === 'leaf' ? 0.35 + Math.random() * 0.3 : kind === 'snow' ? 0.3 + Math.random() * 0.45 : 0.25 + Math.random() * 0.35,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.03,
        phase: Math.random() * Math.PI * 2,
        hue: Math.floor(Math.random() * 3),
      }
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Талбайгаар: утсанд ~12, том дэлгэцэнд ~36 хүртэл
      const n = Math.max(10, Math.min(36, Math.round((w * h) / 26000)))
      parts = Array.from({ length: n }, () => spawn(true))
    }

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (!visible || t - last < 33) return
      last = t
      const colors = palette(kind, document.documentElement.dataset.theme)
      ctx.clearRect(0, 0, w, h)
      for (const p of parts) {
        p.phase += 0.02
        p.x += p.vx + Math.sin(p.phase) * (kind === 'leaf' ? 0.6 : 0.25)
        p.y += p.vy
        p.rot += p.vr
        if (p.y > h + 20 || p.y < -20 || p.x < -20 || p.x > w + 20) Object.assign(p, spawn(false))
        const c = colors[p.hue % colors.length]
        ctx.fillStyle = `rgba(${c},${p.a})`
        if (kind === 'leaf') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot)
          ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.45, 0, 0, Math.PI * 2); ctx.fill()
          ctx.strokeStyle = `rgba(${c},${p.a * 0.8})`; ctx.lineWidth = 0.8
          ctx.beginPath(); ctx.moveTo(-p.r, 0); ctx.lineTo(p.r, 0); ctx.stroke()
          ctx.restore()
        } else {
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
        }
      }
    }

    resize()
    raf = requestAnimationFrame(draw)
    const ro = new ResizeObserver(resize); ro.observe(canvas)
    // Дэлгэцээс гарсан эсвэл таб нуугдсан үед зогсоно
    let inView = true
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; visible = inView && !document.hidden })
    io.observe(canvas)
    const onVis = () => { visible = inView && !document.hidden }
    document.addEventListener('visibilitychange', onVis)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  return <canvas ref={ref} className="lp-season" aria-hidden="true" />
}

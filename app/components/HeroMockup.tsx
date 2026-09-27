'use client'
// Нүүр хуудасны hero-гийн бүтээгдэхүүний дүрслэл — админ (компьютер) + хэрэглэгч (утас)
// Дэлгэцийн зураг биш, HTML/CSS: хурц, хөнгөн, шинэ дизайнтай үргэлж ижил харагдана.
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CargoJourney from './CargoJourney'
import { ClipboardList, PackageOpen, PackageCheck, HandCoins, History, Bell, CheckCircle2, Truck, Search } from 'lucide-react'

const ROWS = [
  { code: 'YT8877078002767', phone: '9911 ••••', date: '09.26', status: 'EREEN_ARRIVED', label: 'Эрээнд ирсэн' },
  { code: 'JT5364974054841', phone: '8820 ••••', date: '09.26', status: 'ARRIVED', label: 'Ирсэн' },
  { code: '79113014507349', phone: '9505 ••••', date: '09.25', status: 'EREEN_ARRIVED', label: 'Эрээнд ирсэн' },
  { code: 'SF1428806611923', phone: '8811 ••••', date: '09.25', status: 'PICKED_UP', label: 'Олгосон' },
  { code: 'YT8870120045518', phone: '9909 ••••', date: '09.24', status: 'ARRIVED', label: 'Ирсэн' },
]

const FLOW = [
  { icon: ClipboardList, label: 'Бүртгүүлсэн', count: 12 },
  { icon: PackageOpen, label: 'Эрээнд ирсэн', count: 48, on: true },
  { icon: PackageCheck, label: 'Ирсэн' },
  { icon: HandCoins, label: 'Олгох', count: 23 },
  { icon: History, label: 'Олгосон' },
]

const STEP_LABELS = ['Бүртгүүлсэн', 'Эрээнд', 'Ирсэн', 'Авсан']

// Ээлжлэн гарах мэдэгдэл — систем "амьд" ажиллаж буй мэдрэмж
const TOASTS = [
  { icon: Truck, title: 'Эрээнд ирлээ', sub: 'YT8877…2767 · хэрэглэгчид мэдэгдэл очлоо', color: 'var(--blue)' },
  { icon: PackageCheck, title: 'УБ-д ирлээ · ₮12,500', sub: 'JT5364…4841 · авахад бэлэн', color: 'var(--yellow)' },
  { icon: CheckCircle2, title: 'Ачаа олгогдлоо', sub: 'SF1428…1923 · төлбөр бүртгэгдлээ', color: 'var(--green)' },
]

function Steps({ idx, color }: { idx: number; color: string }) {
  return (
    <div style={{ ['--step-color' as string]: color }}>
      <div className="ship-steps" style={{ padding: '0.45rem 0.7rem 0.35rem' }}>
        {STEP_LABELS.map((k, i) => <span key={k} className={`ship-step${i <= idx ? ' done' : ''}`} />)}
      </div>
      <div className="ship-steps-labels" style={{ padding: '0 0.7rem 0.5rem', fontSize: '0.56rem' }}>
        {STEP_LABELS.map((k, i) => <span key={k} className={i === idx ? 'cur' : ''}>{k}</span>)}
      </div>
    </div>
  )
}

export default function HeroMockup() {
  const [t, setT] = useState(0)

  useEffect(() => {
    const ok = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!ok) return
    const id = setInterval(() => setT(i => (i + 1) % TOASTS.length), 3200)
    return () => clearInterval(id)
  }, [])

  const toast = TOASTS[t]
  const ToastIcon = toast.icon

  return (
    <div className="hm" aria-hidden>
      {/* ── Ачааны бодит аялал: Хятад → Эрээн → машин → УБ → хэрэглэгч ── */}
      <CargoJourney />

      <div className="hm-stage">
        {/* ── Компьютер: админ ── */}
        <div className="hm-desk">
          <div className="hm-bar">
            <span className="hm-dots"><i /><i /><i /></span>
            <span className="hm-url">tanaikargo.aicargo.mn/admin</span>
          </div>
          <div className="hm-app">
            <div className="hm-top">
              <span className="hm-logo"><b>T</b>Танай карго</span>
              <span className="hm-top-r"><Bell size={13} /><i className="hm-dot-badge">3</i></span>
            </div>
            <div className="hm-flow">
              {FLOW.map(f => {
                const Icon = f.icon
                return (
                  <span key={f.label} className={f.on ? 'on' : ''}>
                    <Icon size={11} strokeWidth={2.3} />{f.label}
                    {f.count && <em>{f.count}</em>}
                  </span>
                )
              })}
            </div>
            <div className="hm-body">
              <div className="hm-head">
                <div>
                  <strong>Эрээнд ирсэн ачаа</strong>
                  <small>Өнөөдөр 48 ачаа бүртгэгдлээ · Excel-ээр 1 товчоор</small>
                </div>
                <span className="hm-search"><Search size={11} />Утас, трак код…</span>
              </div>
              <div className="hm-table">
                <div className="hm-tr hm-th"><span>Трак код</span><span>Утас</span><span>Огноо</span><span>Төлөв</span></div>
                {ROWS.map(r => (
                  <div key={r.code} className="hm-tr">
                    <span className="hm-mono">{r.code}</span>
                    <span className="hm-mono hm-muted">{r.phone}</span>
                    <span className="hm-muted">{r.date}</span>
                    <span><span className={`badge badge-${r.status}`}>{r.label}</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Утас: хэрэглэгч ── */}
        <div className="hm-phone">
          <div className="hm-notch" />
          <div className="hm-phone-head">
            <strong>Миний ачаа</strong>
            <span className="hm-chip">3</span>
          </div>
          {[
            { code: 'YT8877078002767', idx: 1, color: 'var(--blue)', status: 'EREEN_ARRIVED', label: 'Эрээнд ирсэн' },
            { code: 'JT5364974054841', idx: 2, color: 'var(--yellow)', status: 'ARRIVED', label: 'Ирсэн', price: '₮12,500' },
            { code: 'SF1428806611923', idx: 3, color: 'var(--green)', status: 'PICKED_UP', label: 'Авсан' },
          ].map(c => (
            <div key={c.code} className={`hm-card order-card-${c.status}`}>
              <div className="hm-card-head">
                <span className="hm-mono">{c.code.slice(0, 6)}…{c.code.slice(-4)}</span>
                <span className={`badge badge-${c.status}`}>{c.label}</span>
              </div>
              <Steps idx={c.idx} color={c.color} />
              {c.price && <div className="hm-price">Төлбөр <b>{c.price}</b></div>}
            </div>
          ))}
        </div>

        {/* ── Ээлжлэх мэдэгдэл ── */}
        <div className="hm-toast-slot">
          <AnimatePresence mode="wait">
            <motion.div
              key={t}
              className="hm-toast"
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="hm-toast-icon" style={{ color: toast.color, background: `color-mix(in srgb, ${toast.color} 12%, transparent)` }}>
                <ToastIcon size={16} strokeWidth={2.2} />
              </span>
              <span>
                <strong>{toast.title}</strong>
                <small>{toast.sub}</small>
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

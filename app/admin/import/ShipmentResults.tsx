'use client'
import { useState } from 'react'

// Админы хайлт / Эрээний жагсаалтын мөр — ачааны одоогийн төлөв, тухайн төлөвт орсон огноо, хэдэн хоног болсон.
// "Эрээнд 9/26 бүртгэгдсэн"

export interface ResultShipment {
  id: number; trackCode: string; status: string; phone: string | null
  createdAt: string; updatedAt: string; ereenArrivedAt: string | null; arrivedAt: string | null
  user?: { name: string; phone: string } | null
}
export interface ResultSummary { counts: Record<string, number>; ereenFrom: string | null; ereenTo: string | null }

// Улаанбаатарын календарийн өдрөөр тооцно
const UB_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' })
const DAY = 86_400_000
function dayNum(iso: string | Date): number {
  return Math.round(Date.parse(`${UB_DAY.format(new Date(iso))}T00:00:00Z`) / DAY)
}
function md(n: number): string {
  const d = new Date(n * DAY)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}
const mdIso = (iso: string) => md(dayNum(iso))

const STATUS = {
  REGISTERED: { label: 'Бүртгэсэн', cls: 'sr-st-reg' },
  EREEN_ARRIVED: { label: 'Эрээнд', cls: 'sr-st-ereen' },
  ARRIVED: { label: 'УБ-д', cls: 'sr-st-arrived' },
  PICKED_UP: { label: 'Олгосон', cls: 'sr-st-picked' },
} as const

// Төлөв бүрт: тухайн төлөвт бүртгэгдсэн огноо
// ("Олгосон" огноо тусдаа хадгалагддаггүй тул сүүлд өөрчлөгдсөн огноо)
function Meta({ s }: { s: ResultShipment }) {
  if (s.status === 'EREEN_ARRIVED') {
    return <>{s.ereenArrivedAt ? `Эрээнд ${mdIso(s.ereenArrivedAt)} бүртгэгдсэн` : 'Эрээнд бүртгэгдсэн огноо тодорхойгүй'}</>
  }
  if (s.status === 'REGISTERED') return <>{mdIso(s.createdAt)} бүртгүүлсэн · Эрээнд бүртгэгдээгүй</>
  if (s.status === 'ARRIVED') return <>{s.arrivedAt ? `УБ-д ${mdIso(s.arrivedAt)} ирсэн` : 'УБ-д ирсэн'}</>
  if (s.status === 'PICKED_UP') return <>{mdIso(s.updatedAt)} олгосон{s.arrivedAt ? ` · УБ-д ${mdIso(s.arrivedAt)} ирсэн` : ''}</>
  return null
}

export function ResultRow({ s, label, showContact, onDelete }: {
  s: ResultShipment
  // Каргоны өөрийн тохируулсан төлвийн нэр (жш: "Эрээнээс 9/26, 27, 30")
  label: string
  showContact: boolean
  onDelete?: () => void
}) {
  const [open, setOpen] = useState(false)
  const contact = showContact ? [s.user?.phone ?? s.phone, s.user?.name].filter(Boolean).join(' · ') : ''
  const steps: [string, string | null, boolean][] = [
    ['Бүртгэсэн', s.createdAt, true],
    ['Эрээнд', s.ereenArrivedAt, s.status === 'EREEN_ARRIVED'],
    ['УБ-д', s.arrivedAt, s.status === 'ARRIVED'],
    ['Олгосон', s.status === 'PICKED_UP' ? s.updatedAt : null, false],
  ]
  return (
    <div className="sr-row">
      <button type="button" className="sr-main" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="sr-code">{s.trackCode}</span>
        <span className={`sr-label${s.status === 'ARRIVED' ? ' sr-label-arrived' : ''}`}>{label}</span>
        <span className="sr-meta">
          <Meta s={s} />
          {contact && <span className="sr-contact"> · {contact}</span>}
        </span>
      </button>
      {onDelete && (
        <button type="button" className="sr-del" onClick={onDelete} title="Устгах" aria-label={`${s.trackCode} устгах`}>✕</button>
      )}
      {open && (
        <div className="sr-tl">
          {steps.map(([name, iso, now]) => (
            <div key={name} className={iso ? (now ? 'now' : 'done') : ''}>
              <b>{name}</b>{iso ? mdIso(iso) : '—'}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ResultSummaryCard({ summary }: { summary: ResultSummary }) {
  const order: (keyof typeof STATUS)[] = ['EREEN_ARRIVED', 'ARRIVED', 'REGISTERED', 'PICKED_UP']
  const chips = order.filter(k => summary.counts[k])
  if (!chips.length) return null
  return (
    <div className="sr-summary">
      <div className="sr-chips">
        {chips.map(k => <span key={k} className={`sr-st ${STATUS[k].cls}`}>{k === 'REGISTERED' ? 'Бүртгүүлсэн' : k === 'ARRIVED' ? 'УБ-д ирсэн' : STATUS[k].label} {summary.counts[k]}</span>)}
      </div>
    </div>
  )
}

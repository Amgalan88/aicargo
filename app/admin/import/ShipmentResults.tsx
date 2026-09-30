'use client'
import { useState } from 'react'

// Админы хайлт / Эрээний жагсаалтын мөр — ачааны одоогийн төлөв, тухайн төлөвт орсон огноо, хэдэн хоног болсон.
// "Эрээнд 9/26 · 4 хоног · ~10/2 ирэх төлөвтэй"; каргоны ердийн хугацаанаас удсан бол "Удаж байна".

export interface ResultShipment {
  id: number; trackCode: string; status: string; phone: string | null
  createdAt: string; updatedAt: string; ereenArrivedAt: string | null; arrivedAt: string | null
  user?: { name: string; phone: string } | null
}
export type Transit = { median: number; p90: number; n: number } | null
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
const since = (iso: string) => dayNum(new Date()) - dayNum(iso)
const daysText = (d: number) => (d <= 0 ? 'өнөөдөр' : `${d} хоног`)

const STATUS = {
  REGISTERED: { label: 'Бүртгэсэн', cls: 'sr-st-reg' },
  EREEN_ARRIVED: { label: 'Эрээнд', cls: 'sr-st-ereen' },
  ARRIVED: { label: 'УБ-д', cls: 'sr-st-arrived' },
  PICKED_UP: { label: 'Олгосон', cls: 'sr-st-picked' },
} as const

// Төлөвт орсон огноо ("Олгосон" тусдаа хадгалагддаггүй тул сүүлд өөрчлөгдсөн огноо)
function statusDate(s: ResultShipment): string | null {
  switch (s.status) {
    case 'REGISTERED': return s.createdAt
    case 'EREEN_ARRIVED': return s.ereenArrivedAt
    case 'ARRIVED': return s.arrivedAt
    case 'PICKED_UP': return s.updatedAt
    default: return null
  }
}

function Meta({ s, transit }: { s: ResultShipment; transit: Transit }) {
  if (s.status === 'EREEN_ARRIVED') {
    if (!s.ereenArrivedAt) return <>Эрээнд ирсэн огноо тодорхойгүй</>
    const d = since(s.ereenArrivedAt)
    if (transit && d > Math.ceil(transit.p90)) return <span className="sr-late">Удаж байна · {d} хоног</span>
    if (!transit) return <>{daysText(d)}</>
    const eta = dayNum(s.ereenArrivedAt) + Math.round(transit.median)
    return <>{daysText(d)} · {eta >= dayNum(new Date()) ? `~${md(eta)} ирэх төлөвтэй` : 'ирэх хугацаа нь болсон'}</>
  }
  if (s.status === 'REGISTERED') return <>{daysText(since(s.createdAt))} · Эрээнд бүртгэгдээгүй</>
  if (s.status === 'ARRIVED') return <>{s.arrivedAt ? `УБ-д ирээд ${daysText(since(s.arrivedAt))} · ` : ''}авахыг хүлээж байна</>
  if (s.status === 'PICKED_UP') return <>{s.arrivedAt ? `УБ-д ${mdIso(s.arrivedAt)} ирсэн` : 'Олгосон'}</>
  return null
}

export function ResultRow({ s, transit, showContact, onDelete }: {
  s: ResultShipment
  transit: Transit
  showContact: boolean
  onDelete?: () => void
}) {
  const [open, setOpen] = useState(false)
  const st = STATUS[s.status as keyof typeof STATUS] ?? { label: s.status, cls: 'sr-st-reg' }
  const date = statusDate(s)
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
        <span className={`sr-st ${st.cls}`}>{st.label}{date ? ` ${mdIso(date)}` : ''}</span>
        <span className="sr-meta">
          <Meta s={s} transit={transit} />
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

export function ResultSummaryCard({ summary, transit }: { summary: ResultSummary; transit: Transit }) {
  const order: (keyof typeof STATUS)[] = ['EREEN_ARRIVED', 'ARRIVED', 'REGISTERED', 'PICKED_UP']
  const chips = order.filter(k => summary.counts[k])
  if (!chips.length) return null
  const notes = [
    summary.ereenFrom && summary.ereenTo
      ? `Эрээнд ${mdIso(summary.ereenFrom)}${mdIso(summary.ereenFrom) !== mdIso(summary.ereenTo) ? `–${mdIso(summary.ereenTo)}` : ''} ирсэн`
      : null,
    transit ? `энэ карго ихэвчлэн ~${Math.round(transit.median)} хоногт УБ-д ирүүлдэг` : null,
  ].filter(Boolean)
  return (
    <div className="sr-summary">
      <div className="sr-chips">
        {chips.map(k => <span key={k} className={`sr-st ${STATUS[k].cls}`}>{k === 'REGISTERED' ? 'Бүртгүүлсэн' : k === 'ARRIVED' ? 'УБ-д ирсэн' : STATUS[k].label} {summary.counts[k]}</span>)}
      </div>
      {notes.length > 0 && <p>{notes.join(' · ')}</p>}
    </div>
  )
}

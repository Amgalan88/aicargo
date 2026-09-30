'use client'

// Эрээний хуудасны хайлт / жагсаалтын мөр — каргоны өөрийн шошго, Эрээнд бүртгэгдсэн огноо

export interface ResultShipment {
  id: number; trackCode: string; status: string; phone: string | null
  createdAt: string; updatedAt: string; ereenArrivedAt: string | null; arrivedAt: string | null
  user?: { name: string; phone: string } | null
}

// Улаанбаатарын цагаар
const UB = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
function ubDate(iso: string): string {
  const p = Object.fromEntries(UB.formatToParts(new Date(iso)).map(x => [x.type, x.value]))
  return `${Number(p.month)}/${Number(p.day)} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}

export function ResultRow({ s, label, showContact, onDelete }: {
  s: ResultShipment
  // Каргоны өөрийн тохируулсан төлвийн нэр (жш: "Эрээнээс 9/26, 27, 30")
  label: string
  showContact: boolean
  onDelete?: () => void
}) {
  const contact = showContact ? [s.user?.phone ?? s.phone, s.user?.name].filter(Boolean).join(' · ') : ''
  return (
    <div className="sr-row">
      <div className="sr-main">
        <span className="sr-code">{s.trackCode}</span>
        <span className="sr-label">{label}</span>
        <span className="sr-meta">
          {s.ereenArrivedAt ? `Эрээнд ${ubDate(s.ereenArrivedAt)} бүртгэгдсэн` : 'Эрээнд бүртгэгдсэн огноо тодорхойгүй'}
          {contact && <span className="sr-contact"> · {contact}</span>}
        </span>
      </div>
      {onDelete && (
        <button type="button" className="sr-del" onClick={onDelete} title="Устгах" aria-label={`${s.trackCode} устгах`}>✕</button>
      )}
    </div>
  )
}

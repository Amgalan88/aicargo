// Агентын тайлан (нууц линк /promo/<token>) — нэвтрэхгүй. Хэрэглэгчийн нэр, утсыг хэсэгчлэн нууна.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { maskName, maskPhone, promoReport } from '@/lib/promo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Агентын тайлан', robots: { index: false, follow: false } }

const tg = (n: number) => '₮' + Math.round(n).toLocaleString('en-US')
const thisMonth = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7)
const shiftMonth = (m: string, n: number) => {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(Date.UTC(y, mo - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const md = (d: Date) => { const u = new Date(d.getTime() + 8 * 3600_000); return `${u.getUTCMonth() + 1}/${u.getUTCDate()}` }

export default async function AgentReport({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ m?: string }> }) {
  const { token } = await params
  const { m } = await searchParams
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) notFound()
  const promo = await prisma.promoCode.findUnique({
    where: { token },
    select: { id: true, cargoId: true, code: true, agentName: true, commissionPct: true, tierName: true, tierPct: true, cargo: { select: { name: true, promoEnabled: true } } },
  })
  if (!promo || !promo.cargo.promoEnabled) notFound()
  const now = thisMonth()
  const month = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= now ? m : now
  const [rep] = (await promoReport(prisma, promo.cargoId, month, promo.id)) ?? []
  if (!rep) notFound()

  return (
    <main className="ap">
      <header className="ap-head">
        <p className="ap-cargo">{promo.cargo.name}</p>
        <h1>Агентын тайлан</h1>
        <p className="ap-code"><b>{promo.code}</b> · {promo.agentName} · шимтгэл {Number(promo.commissionPct)}%{promo.tierName ? ` · хэрэглэгчид ${promo.tierName} ${promo.tierPct}%` : ''}</p>
      </header>
      <nav className="ap-month" aria-label="Сар сонгох">
        <Link href={`?m=${shiftMonth(month, -1)}`} aria-label="Өмнөх сар">‹</Link>
        <b>{month.replace('-', ' оны ')} сар</b>
        {month < now ? <Link href={`?m=${shiftMonth(month, 1)}`} aria-label="Дараагийн сар">›</Link> : <span />}
      </nav>
      <section className="ap-tiles">
        <div><b>{rep.members}</b><span>нийт хэрэглэгч</span></div>
        <div><b>+{rep.newMembers}</b><span>энэ сард шинэ</span></div>
        <div><b>{tg(rep.paidMnt)}</b><span>тэдний төлсөн дүн</span></div>
        <div className="ap-total"><b>{tg(rep.commissionMnt)}</b><span>таны шимтгэл</span></div>
      </section>
      <section className="ap-list" aria-label="Хэрэглэгчид">
        {rep.lines.length === 0 ? <p className="ap-empty">Таны кодоор бүртгүүлсэн хэрэглэгч алга.</p> : rep.lines.map((l, i) => (
          <div key={i} className="ap-row">
            <span>{maskName(l.name)} <small>{maskPhone(l.phone)}</small></span>
            <small>{md(l.joinedAt)}-нд · {l.receipts} олголт</small>
            <b>{tg(l.paidMnt)}</b>
          </div>
        ))}
      </section>
      <p className="ap-foot">Шимтгэл нь таны кодоор бүртгүүлсэн хүмүүсийн ачаа авахдаа бодитоор төлсөн дүнгээр бодогдоно. Төлбөрийг карго сар бүр шилжүүлнэ.</p>
    </main>
  )
}

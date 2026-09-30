import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { billingState, formatBillingDate, GRACE_DAYS } from '@/lib/billing'
import BillingPanel from '../BillingPanel'

export const metadata = { title: 'Вэбсайтын төлбөр — Aicargo' }

// Вэбсайтын төлбөр: одоогийн хугацаа, өнөөдөр төлбөл хэдий хүртэл, төлбөр хэрхэн тооцогддог
export default async function BillingPage() {
  const user = await getAuthUser()
  if (!user?.cargoId) redirect('/admin')
  const cargo = await prisma.cargo.findUnique({ where: { id: user.cargoId }, select: { name: true, paidUntil: true } })
  if (!cargo) redirect('/admin')
  const paidUntil = cargo.paidUntil?.toISOString() ?? null
  const s = billingState(paidUntil)

  const status = !s ? { text: 'Хугацаа тохируулаагүй', color: 'var(--muted)' }
    : s.blocked ? { text: `Хугацаа ${s.overdueDays} хоногийн өмнө дууссан — систем хаагдсан`, color: 'var(--danger)' }
    : s.inGrace ? { text: `Хугацаа ${s.overdueDays} хоногийн өмнө дууссан — ${Math.max(0, GRACE_DAYS - s.overdueDays)} хоногийн дараа хаагдана`, color: 'var(--orange)' }
    : { text: `${s.daysLeft} хоног үлдсэн`, color: s.daysLeft < 7 ? 'var(--orange)' : 'var(--green)' }

  return (
    <div className="page-wide" style={{ maxWidth: 560 }}>
      <h1 className="section-title">Вэбсайтын төлбөр</h1>
      <div className="card" style={{ padding: '1rem 1.2rem', marginBottom: '1rem' }}>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>Төлөгдсөн хугацаа</div>
        <div style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0.15rem 0' }}>{paidUntil ? `${formatBillingDate(paidUntil)} хүртэл` : '—'}</div>
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: status.color }}>{status.text}</div>
      </div>
      <BillingPanel cargoName={cargo.name} paidUntil={paidUntil} explainOpen />
    </div>
  )
}

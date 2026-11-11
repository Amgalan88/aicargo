import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ScanLine, Plus, FileSpreadsheet, PackageCheck, Megaphone } from 'lucide-react'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// /admin — «Өнөөдөр» самбар (өмнө нь Next-ийн англи 404). Нэвтрэлтийн урсгал хэвээр (/admin/import руу),
// энд зөвхөн өдрийн тойм + хурдан үйлдэл. Тоонууд нь зөвхөн тухайн каргоных.
export const dynamic = 'force-dynamic'

const STALE_DAYS = 14

// Улаанбаатарын (UTC+8) өнөөдрийн эхлэл
function ubTodayStart(now = new Date()): Date {
  const ub = new Date(now.getTime() + 8 * 3_600_000)
  return new Date(Date.UTC(ub.getUTCFullYear(), ub.getUTCMonth(), ub.getUTCDate()) - 8 * 3_600_000)
}
const tg = (n: number) => `₮${Math.round(n).toLocaleString('en-US')}`

export default async function AdminHome() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  if (!user.cargoId) redirect(user.role === 'SUPER_ADMIN' ? '/super' : '/login')
  const cargoId = user.cargoId
  const cargo = await (prisma.cargo.findUnique as any)({ where: { id: cargoId }, select: { batchEnabled: true } })
  const batch = !!cargo?.batchEnabled
  const staleBefore = new Date(Date.now() - STALE_DAYS * 86_400_000)

  const [ready, ereen, today, stale] = await Promise.all([
    prisma.shipment.aggregate({ where: { cargoId, status: 'ARRIVED' }, _count: { _all: true }, _sum: { adminPrice: true } }),
    prisma.shipment.count({ where: { cargoId, status: 'EREEN_ARRIVED' } }),
    prisma.shipment.aggregate({ where: { cargoId, status: 'PICKED_UP', updatedAt: { gte: ubTodayStart() } }, _count: { _all: true }, _sum: { adminPrice: true } }),
    prisma.shipment.count({ where: { cargoId, status: 'EREEN_ARRIVED', OR: [{ ereenArrivedAt: { lt: staleBefore } }, { ereenArrivedAt: null, updatedAt: { lt: staleBefore } }] } }),
  ])
  const handoverHref = batch ? '/admin/batch-handover' : '/admin/handover'

  return (
    <div className="page-wide admin-home">
      <h1 className="section-title" style={{ margin: '0 0 1rem' }}>Өнөөдөр</h1>
      <div className="admin-home-grid">
        <Link href={handoverHref} className="admin-stat" data-testid="stat-ready">
          <span className="admin-stat-label">Олгоход бэлэн</span>
          <span className="admin-stat-value">{ready._count._all} <small>ачаа</small></span>
          <span className="admin-stat-sub" style={{ color: 'var(--accent)' }}>{tg(Number(ready._sum.adminPrice ?? 0))}</span>
        </Link>
        <Link href="/admin/import" className="admin-stat" data-testid="stat-ereen">
          <span className="admin-stat-label">Эрээнд ирсэн</span>
          <span className="admin-stat-value">{ereen}</span>
          <span className="admin-stat-sub">ачаалах хүлээгдэж буй</span>
        </Link>
        <Link href="/admin/history" className="admin-stat" data-testid="stat-today">
          <span className="admin-stat-label">Өнөөдөр олгосон</span>
          <span className="admin-stat-value">{today._count._all}</span>
          <span className="admin-stat-sub" style={{ color: 'var(--green)' }}>{tg(Number(today._sum.adminPrice ?? 0))}</span>
        </Link>
        <Link href="/admin/import" className={`admin-stat${stale > 0 ? ' admin-stat-warn' : ''}`} data-testid="stat-stale">
          <span className="admin-stat-label">{stale > 0 ? 'Анхаарах' : 'Удаан хүлээсэн'}</span>
          <span className="admin-stat-value">{stale}</span>
          <span className="admin-stat-sub">Эрээнд {STALE_DAYS}+ хоног</span>
        </Link>
      </div>

      <h2 className="admin-home-h2">Хурдан үйлдэл</h2>
      <Link href={handoverHref} className="btn admin-home-primary"><ScanLine size={18} /> Сканнер — ачаа олгох</Link>
      <div className="admin-home-actions">
        <Link href="/admin/import" className="admin-home-action"><Plus size={16} /> Трак код оруулах</Link>
        <Link href="/admin/import" className="admin-home-action"><FileSpreadsheet size={16} /> Excel оруулах</Link>
        <Link href="/admin/arrived" className="admin-home-action"><PackageCheck size={16} /> Ирсэн болгох</Link>
        <Link href="/admin/notify" className="admin-home-action"><Megaphone size={16} /> Мэдэгдэл илгээх</Link>
      </div>
    </div>
  )
}

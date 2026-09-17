import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { warehousePath } from '@/lib/warehouse'
import WarehouseTabs from './WarehouseTabs'

export const revalidate = 0

export default async function WarehouseLayout({ children, params }: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const id = Number((await params).id)
  if (!id) notFound()
  const wh = await prisma.partnerWarehouse.findUnique({
    where: { id },
    select: {
      id: true, name: true, slug: true, active: true,
      _count: { select: { sections: true } },
    },
  })
  if (!wh) notFound()

  return (
    <div className="page-wide" style={{ maxWidth: 860 }}>
      <Link href="/super/warehouses" style={{ fontSize: '0.82rem', color: 'var(--muted)', display: 'inline-block', marginBottom: '0.6rem' }}>
        ← Агуулахууд
      </Link>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <h1 className="section-title" style={{ margin: 0 }}>
          {wh.name}
          {!wh.active && <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 500, marginLeft: 8 }}>(нуусан)</span>}
        </h1>
        {wh.active && (
          <a href={warehousePath(wh)} target="_blank" rel="noreferrer" style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 600 }}>
            Нийтийн хуудас харах ↗
          </a>
        )}
      </div>
      <WarehouseTabs id={wh.id} sectionCount={wh._count.sections} />
      {children}
    </div>
  )
}

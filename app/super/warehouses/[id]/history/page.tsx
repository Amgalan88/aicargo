import { prisma } from '@/lib/prisma'
import { WAREHOUSE_LOG_ACTIONS } from '@/lib/warehouse-log'

export const revalidate = 0

const PAGE_SIZE = 100

function fmt(d: Date) {
  // Эрээн/Улаанбаатар ижил цагийн бүс (UTC+8)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(',', '')
}

export default async function WarehouseHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const warehouseId = Number((await params).id)
  const logs = await prisma.warehouseLog.findMany({
    where: { warehouseId },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE,
    select: { id: true, userName: true, action: true, detail: true, createdAt: true },
  })

  if (logs.length === 0) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
        Өөрчлөлт бүртгэгдээгүй байна.
      </div>
    )
  }

  return (
    <div>
      <p style={{ color: 'var(--muted)', fontSize: '0.83rem', margin: '0 0 1rem' }}>
        Сүүлийн {PAGE_SIZE} өөрчлөлт. Данс өөрчилсөн бичлэг улаанаар тодорно.
      </p>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {logs.map(l => {
          const bank = l.action === 'BANK_CHANGED'
          return (
            <div key={l.id} style={{
              padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)',
              background: bank ? 'color-mix(in srgb, var(--danger) 7%, transparent)' : undefined,
              borderLeft: `3px solid ${bank ? 'var(--danger)' : 'transparent'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: bank ? 'var(--danger)' : 'var(--text)' }}>
                  {WAREHOUSE_LOG_ACTIONS[l.action] ?? l.action}
                </span>
                <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                  {l.userName} · {fmt(l.createdAt)}
                </span>
              </div>
              {l.detail && (
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {l.detail}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

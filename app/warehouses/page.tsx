import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import NavLogo from '@/app/components/NavLogo'
import { cloudinaryThumb, formatMnt, warehousePath } from '@/lib/warehouse'

export const revalidate = 0

export const metadata = {
  title: 'Эрээний түншлэгч агуулахууд — Aicargo',
  description: 'Эрээн хот дахь найдвартай агуулахууд — зураг, үйлчилгээ, тариф. Карго компаниуд хамтран ажиллах гэрээ байгуулна.',
}

export default async function WarehousesPage() {
  const warehouses = await prisma.partnerWarehouse.findMany({
    where: { active: true },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    select: {
      id: true, slug: true, name: true, description: true, address: true, imageUrl: true,
      contractFee: true, acceptingContracts: true,
      _count: { select: { images: true } },
    },
  })

  return (
    <>
      <nav className="nav">
        <Link href="/"><NavLogo /></Link>
      </nav>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 5% 3rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 0.3rem', letterSpacing: '-0.4px' }}>
          Эрээний түншлэгч агуулахууд
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.88rem', margin: '0 0 1.75rem', lineHeight: 1.6 }}>
          Агуулахын зураг, үйлчилгээ, тарифтай танилцаж, хамтран ажиллах гэрээ байгуулаарай.
          Гэрээ байгуулсан каргод агуулах тусгай зай талбай гаргаж, ачааг хүлээн авч, баглаж савлана.
        </p>

        {warehouses.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Одоогоор агуулах бүртгэгдээгүй байна.</p>
        ) : (
          <>
            <style>{`
              .wh-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
              .wh-card { display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border);
                border-radius: var(--radius); overflow: hidden; color: inherit; text-decoration: none;
                transition: border-color 0.12s, transform 0.12s; }
              .wh-card:hover { border-color: var(--accent); transform: translateY(-2px); }
            `}</style>
            <div className="wh-list">
              {warehouses.map(w => (
                <Link key={w.id} href={warehousePath(w)} className="wh-card">
                  <div style={{ position: 'relative' }}>
                    {w.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cloudinaryThumb(w.imageUrl, 600)} alt={w.name}
                        style={{ width: '100%', aspectRatio: '3 / 2', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{
                        width: '100%', aspectRatio: '3 / 2', background: 'var(--surface2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem',
                      }}>🏭</div>
                    )}
                    {w._count.images > 0 && (
                      <span style={{
                        position: 'absolute', right: 8, bottom: 8, background: 'rgba(0,0,0,0.6)', color: '#fff',
                        fontSize: '0.7rem', fontWeight: 600, borderRadius: 100, padding: '0.15rem 0.55rem',
                      }}>📷 {w._count.images}</span>
                    )}
                  </div>
                  <div style={{ padding: '0.85rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>{w.name}</div>
                    {w.address && <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>📍 {w.address}</div>}
                    {w.description && (
                      <div style={{
                        fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.5,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>{w.description}</div>
                    )}
                    <div style={{ marginTop: 'auto', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                      <span>
                        Гэрээ: <b>{formatMnt(w.contractFee.toString())}</b>
                        {!w.acceptingContracts && <span style={{ color: 'var(--muted)' }}> · түр хаалттай</span>}
                      </span>
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Үзэх →</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

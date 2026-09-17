import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import NavLogo from '@/app/components/NavLogo'
import { formatMnt, cloudinaryThumb, warehousePath } from '@/lib/warehouse'
import WarehouseGallery from './WarehouseGallery'

export const revalidate = 0

// Нийтийн хуудас — банкны мэдээллийг хэзээ ч select хийхгүй
async function getWarehouse(slug: string) {
  const byId = /^\d+$/.test(slug)
  return prisma.partnerWarehouse.findFirst({
    where: { active: true, ...(byId ? { id: Number(slug) } : { slug }) },
    select: {
      id: true, name: true, slug: true, description: true, phone: true, wechat: true,
      address: true, imageUrl: true, legalNameMn: true, legalNameCn: true,
      services: true, pricePerTonCny: true, pricePerM3Cny: true,
      contractFee: true, acceptingContracts: true,
      images: {
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        select: { id: true, url: true, caption: true, category: true },
      },
    },
  })
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const wh = await getWarehouse((await params).slug)
  if (!wh) return { title: 'Агуулах олдсонгүй — Aicargo' }
  return {
    title: `${wh.name} — Эрээний агуулах | Aicargo`,
    description: wh.description ?? `${wh.name} — Эрээн хот дахь түншлэгч агуулах. Зураг, үйлчилгээ, тариф.`,
    openGraph: wh.imageUrl ? { images: [cloudinaryThumb(wh.imageUrl, 1200)] } : undefined,
  }
}

export default async function WarehousePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const wh = await getWarehouse(slug)
  if (!wh) notFound()
  if (wh.slug && slug !== wh.slug) redirect(warehousePath(wh))

  const services = (wh.services ?? '').split('\n').map(s => s.trim()).filter(Boolean)
  const hasTariff = wh.pricePerTonCny != null || wh.pricePerM3Cny != null

  return (
    <>
      <nav className="nav">
        <Link href="/"><NavLogo /></Link>
      </nav>

      <div style={{ position: 'relative' }}>
        {wh.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wh.imageUrl} alt={wh.name}
            style={{ width: '100%', height: '34vh', minHeight: 200, objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{
            width: '100%', height: '18vh', background: 'var(--surface2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem',
          }}>🏭</div>
        )}
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 5% 3rem' }}>
        <Link href="/warehouses" style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>← Бүх агуулах</Link>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0.4rem 0 0.2rem', letterSpacing: '-0.4px' }}>{wh.name}</h1>
        {(wh.legalNameMn || wh.legalNameCn) && (
          <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: 0 }}>
            {[wh.legalNameMn, wh.legalNameCn].filter(Boolean).join(' · ')}
          </p>
        )}

        <style>{`
          .wh-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 1.5rem; margin-top: 1.5rem; align-items: start; }
          @media (max-width: 800px) { .wh-layout { grid-template-columns: 1fr; } }
        `}</style>
        <div className="wh-layout">
          <div>
            {wh.description && (
              <p style={{ fontSize: '0.9rem', lineHeight: 1.7, margin: '0 0 1.5rem', whiteSpace: 'pre-wrap' }}>
                {wh.description}
              </p>
            )}

            <h2 style={h2}>Агуулахын зургууд</h2>
            <WarehouseGallery images={wh.images} name={wh.name} />

            {services.length > 0 && (
              <>
                <h2 style={{ ...h2, marginTop: '2rem' }}>Үйлчилгээ</h2>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.88rem', lineHeight: 1.9 }}>
                  {services.map(s => <li key={s}>{s}</li>)}
                </ul>
              </>
            )}
          </div>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'sticky', top: '1rem' }}>
            <div className="card" style={{ padding: '1.1rem', borderColor: 'var(--accent)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600 }}>Хамтран ажиллах гэрээ</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.2rem 0' }}>{formatMnt(wh.contractFee.toString())}</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--muted)', lineHeight: 1.55 }}>
                Нэг удаагийн төлбөр · байнгын гэрээ<br />
                Гэрээ байгуулсан каргод агуулахад тусгай зай талбай гаргаж, ачаа хүлээн авах, ангилах, баглаж савлах ажлыг гүйцэтгэнэ.
              </div>
              <div style={{
                marginTop: '0.9rem', padding: '0.6rem 0.7rem', borderRadius: 8,
                background: 'var(--surface2)', fontSize: '0.78rem', textAlign: 'center', fontWeight: 600,
              }}>
                {wh.acceptingContracts ? 'Цахим гэрээ байгуулах боломж удахгүй нээгдэнэ' : 'Одоогоор шинэ гэрээ хүлээн авахгүй байна'}
              </div>
            </div>

            {hasTariff && (
              <div className="card" style={{ padding: '1.1rem' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.4rem' }}>Тээврийн тариф</div>
                {wh.pricePerTonCny != null && <Row label="1 тонн" value={`¥${Number(wh.pricePerTonCny).toLocaleString('en-US')}`} />}
                {wh.pricePerM3Cny != null && <Row label="1 м³" value={`¥${Number(wh.pricePerM3Cny).toLocaleString('en-US')}`} />}
                <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '0.4rem 0 0' }}>Тухайн өдрийн ханшаар төгрөгт хөрвүүлнэ.</p>
              </div>
            )}

            {(wh.address || wh.phone || wh.wechat) && (
              <div className="card" style={{ padding: '1.1rem' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.4rem' }}>Холбоо барих</div>
                {wh.address && <Row label="Хаяг" value={wh.address} />}
                {wh.phone && <Row label="Утас" value={<a href={`tel:${wh.phone.replace(/\s/g, '')}`} style={{ color: 'var(--accent)' }}>{wh.phone}</a>} />}
                {wh.wechat && <Row label="WeChat" value={wh.wechat} />}
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.82rem' }}>
      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

const h2: React.CSSProperties = { fontSize: '1.05rem', fontWeight: 800, margin: '0 0 0.8rem' }

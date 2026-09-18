import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth'
import NavLogo from '@/app/components/NavLogo'
import { formatMnt, warehousePath, cloudinaryThumb } from '@/lib/warehouse'
import { WAREHOUSE_CONTRACT_SELECT, warehouseReadiness } from '@/lib/contract-server'
import { WEBSITE_BONUS_DAYS } from '@/lib/contract'

export const revalidate = 0
export const metadata = { title: 'Цахим гэрээ байгуулах — Aicargo' }

const STEPS = [
  ['Каргогоо нээнэ', 'aicargo-д өөрийн каргогийн вэбсайтыг нээнэ — эхний 30 хоног үнэгүй.'],
  ['Агуулах цэснээс гэрээ эхлүүлнэ', 'Каргогийн админ хэсгийн "Агуулах" цэсэнд гэрээ, төлбөрийн явц харагдана.'],
  ['Баталгаажуулж, төлбөр төлнө', 'Мэдээллээ бөглөж вэб дээр баталгаажуулаад агуулахын дансанд шилжүүлнэ.'],
  ['Гэрээ хүчин төгөлдөр', `Батлагдмагц PDF гэрээ татна, вэбсайт тань ${WEBSITE_BONUS_DAYS} хоногоор сунгагдана.`],
]

// Агуулахтай гэрээг зөвхөн нээсэн карго байгуулна — энэ хуудас карго нээх / нэвтрэх рүү чиглүүлнэ
export default async function StartContractPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const byId = /^\d+$/.test(slug)
  const wh = await prisma.partnerWarehouse.findFirst({
    where: { active: true, ...(byId ? { id: Number(slug) } : { slug }) },
    select: { ...WAREHOUSE_CONTRACT_SELECT, imageUrl: true, _count: { select: { templates: true } } },
  })
  if (!wh) notFound()
  if (wh.slug && slug !== wh.slug) redirect(`${warehousePath(wh)}/contract`)

  const adminPath = `/admin/warehouse?new=${wh.id}`
  const user = await getAuthUser()
  if (user?.role === 'ADMIN') redirect(adminPath)

  const ready = wh.acceptingContracts && warehouseReadiness(wh, wh._count.templates > 0).length === 0

  return (
    <>
      <nav className="nav"><Link href="/"><NavLogo /></Link></nav>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '1.5rem 5% 3rem' }}>
        <Link href={warehousePath(wh)} style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>← {wh.name}</Link>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', margin: '0.8rem 0 1.4rem' }}>
          {wh.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cloudinaryThumb(wh.imageUrl, 160)} alt="" style={{ width: 88, height: 60, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
          )}
          <div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, letterSpacing: '-0.3px' }}>Цахим гэрээ байгуулах</h1>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              {wh.name} · гэрээний төлбөр <b style={{ color: 'var(--text)' }}>{formatMnt(wh.contractFee.toString())}</b> (нэг удаа, буцаагдахгүй)
            </div>
          </div>
        </div>

        {!ready ? (
          <div className="card" style={{ padding: '1.25rem', borderColor: '#d97706' }}>
            <b>Энэ агуулах одоогоор цахим гэрээ хүлээн авахгүй байна.</b>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0.4rem 0 0' }}>Агуулахтай утсаар холбогдоно уу.</p>
          </div>
        ) : (
          <>
            <div className="card" style={{ padding: '1.3rem', borderColor: 'var(--accent)', marginBottom: '1.2rem' }}>
              <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.35rem' }}>Эхлээд каргогоо нээнэ үү</h2>
              <p style={{ fontSize: '0.86rem', color: 'var(--muted)', margin: '0 0 1rem', lineHeight: 1.6 }}>
                Агуулахтай гэрээг aicargo-д бүртгэлтэй карго байгуулна. Гэрээ, төлбөрийн явц тань каргогийн
                админ хэсгийн <b style={{ color: 'var(--text)' }}>"Агуулах"</b> цэсэнд хадгалагдана.
              </p>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <Link href={`/signup-cargo?warehouse=${wh.id}`} className="btn" style={{ textDecoration: 'none' }}>
                  Карго нээх — 30 хоног үнэгүй →
                </Link>
                <Link href={`/login?next=${encodeURIComponent(adminPath)}`} className="btn-ghost" style={{ textDecoration: 'none' }}>
                  Карготой бол нэвтрэх
                </Link>
              </div>
            </div>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.6rem' }}>
              {STEPS.map(([t, d], i) => (
                <li key={t} className="card" style={{ padding: '0.8rem 0.9rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)' }}>АЛХАМ {i + 1}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', margin: '0.15rem 0' }}>{t}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>{d}</div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </>
  )
}

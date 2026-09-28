import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth'
import NavLogo from '@/app/components/NavLogo'
import { formatMnt, warehousePath, cloudinaryThumb } from '@/lib/warehouse'
import { WAREHOUSE_CONTRACT_SELECT, LATEST_TEMPLATE_INCLUDE, warehouseReadiness } from '@/lib/contract-server'
import { CARGO_FIELDS } from '@/lib/contract'
import { DEMO_SLUG } from '@/lib/demo'
import RequestForm from './RequestForm'

export const revalidate = 0
export const metadata = { title: 'Эрээнд агуулахтай гэрээ байгуулах — Aicargo' }

// Агуулахтай гэрээ — нэг богино маягт: хүсэлт → төлбөр → агуулах холбогдоно.
// Хүн бүрт ижил: карго нээх, нэвтрэх шаардлагагүй, и-мэйлийн кодоор баталгаажна.
export default async function StartContractPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const byId = /^\d+$/.test(slug)
  const wh = await prisma.partnerWarehouse.findFirst({
    where: { active: true, ...(byId ? { id: Number(slug) } : { slug }) },
    select: { ...WAREHOUSE_CONTRACT_SELECT, imageUrl: true, ...LATEST_TEMPLATE_INCLUDE },
  })
  if (!wh) notFound()
  if (wh.slug && slug !== wh.slug) redirect(`${warehousePath(wh)}/contract`)

  const ready = wh.acceptingContracts && warehouseReadiness(wh, wh.templates[0]).length === 0

  // Нэвтэрсэн каргогийн эзэмшигч бол мэдээллийг нь урьдчилж бөглөнө — алхмууд нь хүн бүрт ижил
  // (и-мэйлийн код, гэрээний холбоос), гэрээ нь мөн тэр каргод холбогдоно
  const user = await getAuthUser()
  let prefill: { values: Record<string, string>; email: string } | null = null
  let cargoName: string | null = null
  if (user?.role === 'ADMIN' && user.cargoId && !user.isStaffAdmin) {
    const [cargo, me] = await Promise.all([
      prisma.cargo.findUnique({ where: { id: user.cargoId }, select: { name: true, slug: true } }),
      prisma.user.findUnique({ where: { id: user.userId }, select: { phone: true, name: true, email: true } }),
    ])
    if (cargo && cargo.slug !== DEMO_SLUG) {
      const [first, ...rest] = (me?.name ?? '').trim().split(/\s+/).reverse()
      cargoName = cargo.name
      prefill = {
        values: { repPhone: me?.phone ?? '', repFirstName: first ?? '', repLastName: rest.reverse().join(' ') },
        email: me?.email ?? '',
      }
    }
  }

  return (
    <>
      <nav className="nav"><Link href="/"><NavLogo /></Link></nav>
      <div className="rq-page">
        <Link href={warehousePath(wh)} className="rq-back">← {wh.name}</Link>
        <div className="rq-head">
          {wh.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cloudinaryThumb(wh.imageUrl, 160)} alt="" />
          )}
          <div>
            <h1>Эрээнд ачаа хүлээн авах гэрээ</h1>
            <p>{wh.name} · <b>{formatMnt(wh.contractFee.toString())}</b> нэг удаа</p>
          </div>
        </div>

        {!ready ? (
          <div className="card" style={{ padding: '1.25rem', borderColor: 'var(--yellow)' }}>
            <b>Энэ агуулах одоогоор цахим гэрээ хүлээн авахгүй байна.</b>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0.4rem 0 0' }}>
              {wh.phone ? <>Агуулахтай холбогдох: <b style={{ color: 'var(--text)' }}>{wh.phone}</b></> : 'Агуулахтай утсаар холбогдоно уу.'}
            </p>
          </div>
        ) : (
          <RequestForm
            warehouseId={wh.id}
            warehouseName={wh.name}
            fee={formatMnt(wh.contractFee.toString())}
            fields={CARGO_FIELDS}
            prefill={prefill}
            cargoName={cargoName}
          />
        )}
      </div>
    </>
  )
}

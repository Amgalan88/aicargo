import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import NavLogo from '@/app/components/NavLogo'
import { cloudinaryThumb, warehousePath } from '@/lib/warehouse'
import WarehouseView from './WarehouseView'

export const revalidate = 0

// Нийтийн хуудас — банкны мэдээллийг хэзээ ч select хийхгүй
async function getWarehouse(slug: string) {
  const byId = /^\d+$/.test(slug)
  return prisma.partnerWarehouse.findFirst({
    where: { active: true, ...(byId ? { id: Number(slug) } : { slug }) },
    select: {
      id: true, name: true, slug: true, description: true, phone: true, wechat: true,
      address: true, imageUrl: true, legalNameMn: true, legalNameCn: true,
      services: true, pricePerTonCny: true, pricePerM3Cny: true, pricePerKgMnt: true,
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

  return (
    <>
      <nav className="nav">
        <Link href="/"><NavLogo /></Link>
      </nav>
      <WarehouseView wh={{
        ...wh,
        contractFee: wh.contractFee.toString(),
        pricePerTonCny: wh.pricePerTonCny?.toString() ?? null,
        pricePerM3Cny: wh.pricePerM3Cny?.toString() ?? null,
        pricePerKgMnt: wh.pricePerKgMnt?.toString() ?? null,
      }} />
    </>
  )
}

import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { warehousePath } from '@/lib/warehouse'

export const dynamic = 'force-dynamic'

// Үндсэн домэйны нийтэд нээлттэй хуудсууд — Google Search Console-д бүртгүүлнэ
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://www.aicargo.mn'
  // Агуулахын жагсаалт авч чадахгүй бол үндсэн хуудсуудаа ч гэсэн буцаана
  const warehouses = await prisma.partnerWarehouse.findMany({
    where: { active: true },
    select: { id: true, slug: true },
  }).catch(() => [])
  return [
    { url: base, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/signup-cargo`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/warehouses`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    ...warehouses.map(w => ({
      url: `${base}${warehousePath(w)}`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.7,
    })),
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ]
}

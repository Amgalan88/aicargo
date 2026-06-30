import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'

export interface CargoInfo {
  id: number
  name: string
  logoUrl: string | null
  ereemReceiver: string
  ereemPhone: string
  ereemRegion: string
  ereemAddress: string
  tariff: string | null
  announcement: string | null
  contactInfo: string | null
  bankName: string | null
  bankAccountHolder: string | null
  bankAccountNumber: string | null
  bankTransferNote: string | null
  arrivedLabel: string | null
  ereemLabel: string | null
  searchByPhone: boolean
}

export async function getCargoFromSubdomain(): Promise<CargoInfo | null> {
  const headersList = await headers()
  const slug = headersList.get('x-cargo-slug')
  if (!slug) return null
  return (prisma.cargo as any).findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      ereemReceiver: true,
      ereemPhone: true,
      ereemRegion: true,
      ereemAddress: true,
      tariff: true,
      announcement: true,
      contactInfo: true,
      bankName: true,
      bankAccountHolder: true,
      bankAccountNumber: true,
      bankTransferNote: true,
      arrivedLabel: true,
      ereemLabel: true,
      searchByPhone: true,
    },
  })
}

import { prisma } from '@/lib/prisma'

// Нээлттэй хайлт болон ботын хариу аль аль нь эдгээр талбарыг буцаана.
export const SHIPMENT_PHONE_SELECT = {
  trackCode: true,
  description: true,
  status: true,
  adminPrice: true,
  updatedAt: true,
} as const

// Нээлттэй хайлт: зөвхөн ирсэн (авах) ачаа. Бот: тухайн карго дээрх архивлаагүй бүх төлөв,
// ингэснээр дөнгөж REGISTERED болгосон ачаа дараагийн хайлтаар харагдана.
export async function listShipmentsByPhone(cargoId: number, phone: string, scope: 'public' | 'bot') {
  if (scope === 'public') {
    return prisma.shipment.findMany({
      where: {
        cargoId,
        phone,
        status: { in: ['EREEN_ARRIVED', 'ARRIVED'] },
        archived: false,
      },
      select: SHIPMENT_PHONE_SELECT,
      orderBy: { updatedAt: 'desc' },
    })
  }
  return prisma.shipment.findMany({
    where: {
      cargoId,
      archived: false,
      OR: [{ phone }, { user: { phone, cargoId } }],
    },
    select: SHIPMENT_PHONE_SELECT,
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })
}

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { userRegistrationLimitError } from '@/lib/import-limits'

type ShipmentRecord = Prisma.ShipmentGetPayload<Record<string, never>>

export type RegisterShipmentResult =
  | { ok: true; shipment: ShipmentRecord; status: 200 | 201 }
  | { ok: false; error: string; status: 400 | 409 | 429 }

// Хэрэглэгчийн POST /api/orders болон ботын бүртгэл хоёулаа энийг дуудна.
// trackCode нь parseTrackCode-оор цэвэрлэгдсэн байна. cargoId нь дуудагч талын tenant.
export async function registerShipmentForUser(input: {
  userId: number
  cargoId: number
  phone: string | null
  trackCode: string
  description: string | null
}): Promise<RegisterShipmentResult> {
  const { userId, cargoId, phone, trackCode, description } = input

  const limitError = await userRegistrationLimitError(userId)
  if (limitError) return { ok: false, status: 429, error: limitError }

  const existing = await prisma.shipment.findUnique({
    where: { trackCode_cargoId: { trackCode, cargoId } },
  })

  if (existing) {
    if (existing.userId && existing.userId !== userId) {
      return { ok: false, status: 409, error: 'Энэ трак код өөр хэрэглэгчид бүртгэлтэй байна' }
    }
    if (existing.userId === userId) {
      return { ok: false, status: 409, error: 'Энэ трак код таны бүртгэлд аль хэдийн байна' }
    }
    // Хэрэглэгч жагсаалтаасаа хассан (эсвэл карго утсаар бүртгэсэн) барааг дахин холбоно.
    // updatedAt-ыг хөдөлгөхгүй (raw SQL) — олгосон бараанд энэ нь олгосон огноо тул
    // дахин бүртгэхэд админы олголт, тайлан дээр „өнөөдөр олгосон“ болж хувирдаг байсан
    const linked = await prisma.$executeRaw`
      UPDATE "Shipment" SET "userId" = ${userId},
        "description" = ${description || existing.description},
        "phone" = ${existing.phone || phone}
      WHERE "id" = ${existing.id} AND "userId" IS NULL`
    if (!linked) {
      return { ok: false, status: 409, error: 'Энэ трак код өөр хэрэглэгчид бүртгэлтэй байна' }
    }
    const updated = await prisma.shipment.findUnique({ where: { id: existing.id } })
    if (!updated) return { ok: false, status: 409, error: 'Энэ трак код өөр хэрэглэгчид бүртгэлтэй байна' }
    return { ok: true, shipment: updated, status: 200 }
  }

  try {
    const shipment = await prisma.shipment.create({
      data: {
        trackCode,
        description: description || null,
        status: 'REGISTERED',
        userId,
        phone,
        cargoId,
      },
    })
    return { ok: true, shipment, status: 201 }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const raced = await prisma.shipment.findUnique({
        where: { trackCode_cargoId: { trackCode, cargoId } },
      })
      if (raced?.userId === userId) {
        return { ok: false, status: 409, error: 'Энэ трак код таны бүртгэлд аль хэдийн байна' }
      }
      return { ok: false, status: 409, error: 'Энэ трак код өөр хэрэглэгчид бүртгэлтэй байна' }
    }
    throw e
  }
}

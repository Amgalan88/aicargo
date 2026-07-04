import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

// Багцын статусыг бүхэлд нь шилжүүлнэ — зөвхөн ADMIN
export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  const cargoId = admin.cargoId!

  const { id, status } = await req.json()
  if (!id || !['EREEN_ARRIVED', 'ARRIVED', 'PICKED_UP'].includes(status)) {
    return NextResponse.json({ error: 'Буруу хүсэлт' }, { status: 400 })
  }

  const batch = await (prisma as any).batch.findFirst({ where: { id: Number(id), cargoId } })
  if (!batch) return NextResponse.json({ error: 'Багц олдсонгүй' }, { status: 404 })

  const rec = await prisma.user.findUnique({ where: { id: admin.userId }, select: { name: true } })
  const now = new Date()
  const stamp =
    status === 'ARRIVED' ? { arrivedAt: now }
    : status === 'EREEN_ARRIVED' ? { arrivedAt: null }
    : {}

  await prisma.$transaction([
    (prisma as any).batch.update({ where: { id: Number(id) }, data: { status } }),
    prisma.shipment.updateMany({
      where: { batchId: Number(id) } as any,
      data: { status, ...stamp } as any,
    }),
    (prisma as any).batchLog.create({
      data: {
        batchId: Number(id),
        userId: admin.userId,
        userName: rec?.name ?? '',
        action: `status:${status}`,
      },
    }),
  ])

  return NextResponse.json({ ok: true })
}

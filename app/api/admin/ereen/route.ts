import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { trackCode } = await req.json()
  if (!trackCode) {
    return NextResponse.json({ error: 'Трак код оруулна уу' }, { status: 400 })
  }

  const code = trackCode.trim().toUpperCase()

  const existing = await prisma.shipment.findUnique({
    where: { trackCode_cargoId: { trackCode: code, cargoId: admin.cargoId! } },
    select: { phone: true, userId: true },
  })

  let userId: number | null = existing?.userId ?? null
  if (!userId && existing?.phone) {
    const user = await prisma.user.findFirst({ where: { phone: existing.phone, cargoId: admin.cargoId! } })
    if (user) userId = user.id
  }

  const shipment = await prisma.shipment.upsert({
    where: { trackCode_cargoId: { trackCode: code, cargoId: admin.cargoId! } },
    update: { status: 'EREEN_ARRIVED', ereenArrivedAt: new Date(), ...(userId ? { userId } : {}) },
    create: { trackCode: code, status: 'EREEN_ARRIVED', ereenArrivedAt: new Date(), cargoId: admin.cargoId!, ...(userId ? { userId } : {}) },
    include: { user: { select: { name: true, phone: true } } },
  })

  return NextResponse.json(shipment)
}

export async function DELETE(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { confirm } = await req.json()
  if (confirm !== 'УСТГАХ') {
    return NextResponse.json({ error: 'Баталгаажуулалт буруу' }, { status: 400 })
  }

  const { count } = await prisma.shipment.deleteMany({
    where: { cargoId: admin.cargoId!, status: 'EREEN_ARRIVED' },
  })

  return NextResponse.json({ count })
}

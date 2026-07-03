import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()

  const shipments = await prisma.shipment.findMany({
    where: { userId: user.userId, cargoId: user.cargoId! },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(shipments)
}

export async function DELETE(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()

  const body = await req.json()

  // Bulk delete
  if (Array.isArray(body.ids)) {
    const shipments = await prisma.shipment.findMany({
      where: { id: { in: body.ids }, userId: user.userId, cargoId: user.cargoId! },
    })
    const toDelete = shipments.filter((s: { status: string; id: number }) => s.status === 'REGISTERED').map((s: { id: number }) => s.id)
    const toUnlink = shipments.filter((s: { status: string; id: number }) => s.status === 'PICKED_UP').map((s: { id: number }) => s.id)
    await Promise.all([
      toDelete.length > 0 && prisma.shipment.deleteMany({ where: { id: { in: toDelete } } }),
      toUnlink.length > 0 && prisma.$executeRaw`UPDATE "Shipment" SET "userId" = NULL WHERE "id" = ANY(${toUnlink}::int[])`,
    ])
    return NextResponse.json({ ok: true, count: toDelete.length + toUnlink.length })
  }

  // Single delete
  const { id } = body
  if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })

  const shipment = await prisma.shipment.findUnique({ where: { id: Number(id) } })
  if (!shipment || shipment.userId !== user.userId) {
    return NextResponse.json({ error: 'Олдсонгүй' }, { status: 404 })
  }
  if (shipment.status === 'PICKED_UP') {
    await prisma.$executeRaw`UPDATE "Shipment" SET "userId" = NULL WHERE "id" = ${Number(id)}`
    return NextResponse.json({ ok: true })
  }
  if (shipment.status !== 'REGISTERED') {
    return NextResponse.json({ error: 'Зөвхөн бүртгүүлсэн эсвэл авсан барааг устгах боломжтой' }, { status: 400 })
  }
  await prisma.shipment.delete({ where: { id: Number(id) } })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const authUser = await getVerifiedUserFromRequest(req)
  if (!authUser) return unauthorized()

  const { trackCode, description } = await req.json()
  if (!trackCode) {
    return NextResponse.json({ error: 'Трак код оруулна уу' }, { status: 400 })
  }

  const code = trackCode.trim().toUpperCase()

  // Fetch user's phone and cargoId (cargoId may be missing in old tokens)
  const userRecord = await prisma.user.findUnique({
    where: { id: authUser.userId },
    select: { phone: true, cargoId: true },
  })

  const cargoId = authUser.cargoId ?? userRecord?.cargoId
  if (!cargoId) {
    return NextResponse.json({ error: 'Та гараад дахин нэвтэрнэ үү' }, { status: 403 })
  }

  const existing = await prisma.shipment.findUnique({
    where: { trackCode_cargoId: { trackCode: code, cargoId } },
  })

  if (existing) {
    if (existing.userId && existing.userId !== authUser.userId) {
      return NextResponse.json({ error: 'Энэ трак код өөр хэрэглэгчид бүртгэлтэй байна' }, { status: 409 })
    }
    if (existing.userId === authUser.userId) {
      return NextResponse.json({ error: 'Энэ трак код таны бүртгэлд аль хэдийн байна' }, { status: 409 })
    }
    const updated = await prisma.shipment.update({
      where: { trackCode_cargoId: { trackCode: code, cargoId } },
      data: {
        userId: authUser.userId,
        description: description || existing.description,
        phone: existing.phone || userRecord?.phone,
      },
    })
    return NextResponse.json(updated)
  }

  // Create new shipment
  const shipment = await prisma.shipment.create({
    data: {
      trackCode: code,
      description: description || null,
      status: 'REGISTERED',
      userId: authUser.userId,
      phone: userRecord?.phone,
      cargoId,
    },
  })

  return NextResponse.json(shipment, { status: 201 })
}

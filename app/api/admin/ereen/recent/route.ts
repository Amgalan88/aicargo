import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const q = req.nextUrl.searchParams.get('q')?.trim()
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || '1'))
  const limit = 20

  // When no query: show only EREEN_ARRIVED. When searching: search all statuses, both phone and trackCode.
  const where = q
    ? {
        cargoId: admin.cargoId!,
        OR: [{ trackCode: { contains: q.toUpperCase() } }, { phone: { contains: q } }],
      }
    : { cargoId: admin.cargoId!, status: 'EREEN_ARRIVED' as const }

  const [total, shipments] = await Promise.all([
    prisma.shipment.count({ where }),
    prisma.shipment.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        trackCode: true,
        status: true,
        phone: true,
        createdAt: true,
        user: { select: { name: true, phone: true } },
      },
    }),
  ])

  return NextResponse.json({ items: shipments, total, page, limit })
}

export async function DELETE(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })

  const shipment = await prisma.shipment.findUnique({ where: { id: Number(id) } })
  if (!shipment || shipment.cargoId !== admin.cargoId) {
    return NextResponse.json({ error: 'Олдсонгүй' }, { status: 404 })
  }
  if (shipment.status !== 'EREEN_ARRIVED') {
    return NextResponse.json({ error: 'Зөвхөн эрээнд байгаа барааг устгах боломжтой' }, { status: 400 })
  }

  await prisma.shipment.delete({ where: { id: Number(id) } })
  return NextResponse.json({ ok: true })
}

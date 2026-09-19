import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { recordDeletions, DELETION_SNAPSHOT_SELECT } from '@/lib/shipment-deletion'

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

  // Хайлтад тохирох устгагдсан ачаа — "энэ ачаа яасан бэ" гэдэгт хариулна
  const deleted = q && page === 1
    ? await prisma.shipmentDeletion.findMany({
        where: { cargoId: admin.cargoId!, OR: [{ trackCode: { contains: q.toUpperCase() } }, { phone: { contains: q } }] },
        orderBy: { deletedAt: 'desc' },
        take: 20,
        select: {
          id: true, trackCode: true, phone: true, customerName: true, description: true, status: true,
          ereenArrivedAt: true, source: true, note: true, deletedByName: true, deletedAt: true,
        },
      })
    : []

  return NextResponse.json({ items: shipments, total, page, limit, deleted })
}

export async function DELETE(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })

  const shipment = await prisma.shipment.findUnique({ where: { id: Number(id) }, select: { ...DELETION_SNAPSHOT_SELECT, cargoId: true } })
  if (!shipment || shipment.cargoId !== admin.cargoId) {
    return NextResponse.json({ error: 'Олдсонгүй' }, { status: 404 })
  }
  if (shipment.status !== 'EREEN_ARRIVED') {
    return NextResponse.json({ error: 'Зөвхөн эрээнд байгаа барааг устгах боломжтой' }, { status: 400 })
  }

  // Устгал, түүх, аудит нэг transaction-д; хооронд нь төлөв өөрчлөгдсөн бол устгахгүй
  const ok = await prisma.$transaction(async tx => {
    const { count } = await tx.shipment.deleteMany({ where: { id: shipment.id, cargoId: admin.cargoId!, status: 'EREEN_ARRIVED' } })
    if (!count) return false
    await recordDeletions(tx, admin.cargoId!, [shipment], { id: admin.userId, name: admin.name }, 'ereen-single')
    await tx.adminAuditLog.create({
      data: { cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name, action: 'shipment:ereen-deleted', detail: shipment.trackCode },
    })
    return true
  })
  if (!ok) return NextResponse.json({ error: 'Ачааны төлөв өөрчлөгдсөн байна' }, { status: 409 })
  return NextResponse.json({ ok: true })
}

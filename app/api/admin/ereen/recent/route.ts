import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { recordDeletions, DELETION_SNAPSHOT_SELECT } from '@/lib/shipment-deletion'

// Каргоны Эрээн → УБ тээврийн ердийн хугацаа (сүүлийн 60 хоногийн медиан, 90-р перцентиль, хоногоор).
// Жагсаалтад "~10/2 ирэх төлөвтэй", "Удаж байна" гэж харуулахад ашиглана. Нэг цаг кэшлэнэ
type Transit = { median: number; p90: number; n: number } | null
const transitCache = new Map<number, { at: number; value: Transit }>()
async function cargoTransit(cargoId: number): Promise<Transit> {
  const hit = transitCache.get(cargoId)
  if (hit && Date.now() - hit.at < 3_600_000) return hit.value
  const [r] = await prisma.$queryRaw<{ median: number | null; p90: number | null; n: number }[]>`
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("arrivedAt" - "ereenArrivedAt")) / 86400)::float AS median,
           percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("arrivedAt" - "ereenArrivedAt")) / 86400)::float AS p90,
           COUNT(*)::int AS n
    FROM "Shipment"
    WHERE "cargoId" = ${cargoId} AND status IN ('ARRIVED', 'PICKED_UP')
      AND "arrivedAt" > NOW() - INTERVAL '60 days' AND "ereenArrivedAt" IS NOT NULL AND "arrivedAt" > "ereenArrivedAt"
  `
  // Цөөн ачаатай бол таамаг найдваргүй — харуулахгүй
  const value: Transit = r && r.n >= 20 && r.median != null && r.p90 != null ? { median: r.median, p90: r.p90, n: r.n } : null
  transitCache.set(cargoId, { at: Date.now(), value })
  return value
}

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

  const [total, shipments, transit, byStatus, ereenRange] = await Promise.all([
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
        updatedAt: true,
        ereenArrivedAt: true,
        arrivedAt: true,
        user: { select: { name: true, phone: true } },
      },
    }),
    cargoTransit(admin.cargoId!),
    // Хайлтын товч дүгнэлт: төлөв тус бүрийн тоо, Эрээнд ирсэн огнооны хүрээ
    q ? prisma.shipment.groupBy({ by: ['status'], where, _count: { _all: true } }) : Promise.resolve([]),
    q ? prisma.shipment.aggregate({ where: { ...where, status: 'EREEN_ARRIVED' }, _min: { ereenArrivedAt: true }, _max: { ereenArrivedAt: true } }) : Promise.resolve(null),
  ])
  const summary = q ? {
    counts: Object.fromEntries(byStatus.map(r => [r.status, r._count._all])),
    ereenFrom: ereenRange?._min.ereenArrivedAt ?? null,
    ereenTo: ereenRange?._max.ereenArrivedAt ?? null,
  } : null

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

  return NextResponse.json({ items: shipments, total, page, limit, deleted, transit, summary })
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

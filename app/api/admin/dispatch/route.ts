import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { auditLater } from '@/lib/audit'
import { dispatchEnabledFor, statsFor } from '@/lib/dispatch'
import { MAX_IMPORT_ROWS } from '@/lib/import-limits'

async function guard(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return { error: unauthorized() }
  if (admin.role !== 'ADMIN' || !admin.cargoId) return { error: forbidden() }
  if (!(await dispatchEnabledFor(admin.cargoId))) {
    return { error: NextResponse.json({ error: 'Тулгалт энэ каргод идэвхжээгүй байна' }, { status: 403 }) }
  }
  return { admin }
}

// GET — тулгалтууд (сүүлийнх нь эхэнд) + тоо; ?open=1 бол зөвхөн дуусаагүй («Ирсэн» хуудсанд үргэлжлүүлэх)
export async function GET(req: NextRequest) {
  const g = await guard(req)
  if (g.error) return g.error
  const cargoId = g.admin.cargoId!
  const onlyOpen = req.nextUrl.searchParams.get('open') === '1'
  const list = await prisma.dispatch.findMany({
    where: { cargoId, ...(onlyOpen ? { closedAt: null } : {}) },
    orderBy: { id: 'desc' },
    take: onlyOpen ? 10 : 100,
    select: { id: true, date: true, name: true, closedAt: true, createdByName: true, createdAt: true },
  })
  const stats = await statsFor(cargoId, list.map(d => d.id))
  return NextResponse.json(list.map(d => ({ ...d, stats: stats.get(d.id) ?? { loaded: 0, arrived: 0, missing: 0, extra: 0 } })))
}

// POST { shipmentIds } — «Эрээнд ирсэн» ачаанаас сонгосноор шинэ тулгалт (энэ удаагийн «Ирсэн» бүртгэлд хүлээгдэх ачаа)
export async function POST(req: NextRequest) {
  const g = await guard(req)
  if (g.error) return g.error
  const admin = g.admin
  const body = await req.json().catch(() => ({}))
  const ids: number[] = Array.isArray(body.shipmentIds) ? body.shipmentIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : []
  if (!ids.length) return NextResponse.json({ error: 'Ачаа сонгоно уу' }, { status: 400 })
  if (ids.length > MAX_IMPORT_ROWS) return NextResponse.json({ error: `Нэг удаад ${MAX_IMPORT_ROWS} хүртэл ачаа сонгоно` }, { status: 400 })

  const ships = await prisma.shipment.findMany({
    where: { id: { in: ids }, cargoId: admin.cargoId!, status: 'EREEN_ARRIVED' },
    select: { trackCode: true, ereenArrivedAt: true },
  })
  if (!ships.length) return NextResponse.json({ error: 'Сонгосон ачаа «Эрээнд ирсэн» төлөвт алга' }, { status: 400 })

  // Нэр: сонгосон Эрээний өдрүүд (жш «Эрээн 10/28, 10/30»)
  const days = [...new Set(ships.map(s => s.ereenArrivedAt ? new Date(s.ereenArrivedAt.getTime() + 8 * 3600_000).toISOString().slice(5, 10).replace('-', '/') : 'огноогүй'))]
  const name = `Эрээн ${days.slice(0, 4).join(', ')}${days.length > 4 ? '…' : ''}`

  const d = await prisma.dispatch.create({
    data: {
      cargoId: admin.cargoId!, date: new Date(), name,
      createdById: admin.userId, createdByName: admin.name,
      items: { createMany: { data: ships.map(s => ({ trackCode: s.trackCode })), skipDuplicates: true } },
    },
    select: { id: true },
  })
  auditLater({ cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name, action: 'dispatch:create', detail: `${name} · ${ships.length} ачаа` })
  return NextResponse.json({ id: d.id, count: ships.length })
}

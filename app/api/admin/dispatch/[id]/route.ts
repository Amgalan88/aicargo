import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { auditLater } from '@/lib/audit'
import { dispatchEnabledFor, statsFor } from '@/lib/dispatch'

async function load(req: NextRequest, idRaw: string) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return { error: unauthorized() }
  if (admin.role !== 'ADMIN' || !admin.cargoId) return { error: forbidden() }
  if (!(await dispatchEnabledFor(admin.cargoId))) return { error: forbidden() }
  const d = await prisma.dispatch.findFirst({ where: { id: Number(idRaw), cargoId: admin.cargoId } })
  if (!d) return { error: NextResponse.json({ error: 'Ачилт олдсонгүй' }, { status: 404 }) }
  return { admin, d }
}

type Row = { trackCode: string; extra: boolean; status: string | null; phone: string | null; name: string | null; arrivedAt: Date | null; price: string | null }

// GET — тулгалтын дэлгэрэнгүй: код бүр (ирсэн / ирээгүй / илүү), эзэн, утас, ирсэн огноо
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await load(req, (await params).id)
  if (g.error) return g.error
  const { d } = g
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT i."trackCode", i.extra, s.status::text AS status,
      COALESCE(u.phone, s.phone) AS phone, u.name, s."arrivedAt", s."adminPrice"::text AS price
    FROM "DispatchItem" i
    LEFT JOIN "Shipment" s ON s."cargoId" = ${d.cargoId} AND s."trackCode" = i."trackCode"
    LEFT JOIN "User" u ON u.id = s."userId"
    WHERE i."dispatchId" = ${d.id}
    ORDER BY i.id`
  const items = rows.map(r => ({
    trackCode: r.trackCode, phone: r.phone, name: r.name, arrivedAt: r.arrivedAt, price: r.price ? Number(r.price) : null,
    result: r.extra ? 'extra' : (r.status === 'ARRIVED' || r.status === 'PICKED_UP') ? 'arrived' : 'missing',
    status: r.status,
  }))
  const stats = (await statsFor(d.cargoId, [d.id])).get(d.id) ?? { loaded: 0, arrived: 0, missing: 0, extra: 0 }
  return NextResponse.json({ id: d.id, date: d.date, name: d.name, closedAt: d.closedAt, createdByName: d.createdByName, stats, items })
}

// PATCH { closed: boolean } — ачилтыг хаах / дахин нээх
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await load(req, (await params).id)
  if (g.error) return g.error
  const { admin, d } = g
  const { closed } = await req.json().catch(() => ({}))
  await prisma.dispatch.update({ where: { id: d.id }, data: { closedAt: closed ? new Date() : null } })
  auditLater({ cargoId: d.cargoId, userId: admin.userId, userName: admin.name, action: closed ? 'dispatch:close' : 'dispatch:reopen', detail: `#${d.id}` })
  return NextResponse.json({ ok: true })
}

// DELETE — ачилтыг устгана (ачаанд хүрэхгүй, зөвхөн жагсаалт)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await load(req, (await params).id)
  if (g.error) return g.error
  const { admin, d } = g
  await prisma.dispatch.delete({ where: { id: d.id } })
  auditLater({ cargoId: d.cargoId, userId: admin.userId, userName: admin.name, action: 'dispatch:delete', detail: `#${d.id}` })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { recordDeletions, DELETION_SNAPSHOT_SELECT } from '@/lib/shipment-deletion'

const MAX = 2000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// YYYY-MM-DD-г Улаанбаатарын цагаар (UTC+8) тухайн өдрийн эхлэл болгоно
function ubDayStart(v: string | null): Date | null {
  if (!v || !DATE_RE.test(v)) return null
  const d = new Date(`${v}T00:00:00+08:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

// Эрээнд ирсэн төлөвт хамгийн удаан байгаа N ачаа — хуучин (огноогүй) бичлэг эхэнд.
// ereenArrivedAt 2026-06 сараас өмнө хадгалагддаггүй байсан тул тэдгээрт updatedAt-ыг ойролцоо огноо болгоно.
export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const sp = req.nextUrl.searchParams
  const limit = Math.min(MAX, Math.max(1, Math.floor(Number(sp.get('limit')) || 20)))
  const where = { cargoId: admin.cargoId!, status: 'EREEN_ARRIVED' as const }

  // Огнооны шүүлт (заавал биш): from өдрөөс, to өдрийг дуустал — Эрээнд ирсэн (эсвэл ойролцоо) огноогоор
  const from = ubDayStart(sp.get('from'))
  const toStart = ubDayStart(sp.get('to'))
  const toEnd = toStart ? new Date(toStart.getTime() + 86_400_000) : null
  if ((sp.get('from') && !from) || (sp.get('to') && !toStart)) return NextResponse.json({ error: 'Огноо буруу байна' }, { status: 400 })
  if (from && toEnd && from >= toEnd) return NextResponse.json({ error: 'Эхлэх огноо дуусах огнооноос хойш байна' }, { status: 400 })

  // Эрэмбэ ба харуулах хоног нэг огноогоор: ereenArrivedAt, байхгүй бол updatedAt ((cargoId, status) индексээр ~1000 мөр эрэмбэлнэ)
  const effective = Prisma.sql`COALESCE("ereenArrivedAt", "updatedAt")`
  const cond = Prisma.sql`"cargoId" = ${admin.cargoId!} AND status = 'EREEN_ARRIVED'
    ${from ? Prisma.sql`AND ${effective} >= ${from}` : Prisma.empty}
    ${toEnd ? Prisma.sql`AND ${effective} < ${toEnd}` : Prisma.empty}`
  const [[{ count: total }], ordered] = await Promise.all([
    prisma.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM "Shipment" WHERE ${cond}`,
    prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Shipment" WHERE ${cond}
      ORDER BY ${effective} ASC, id ASC
      LIMIT ${limit}
    `,
  ])
  const found = await prisma.shipment.findMany({
    where: { ...where, id: { in: ordered.map(o => o.id) } },
    select: {
      id: true, trackCode: true, phone: true, description: true, ereenArrivedAt: true, updatedAt: true,
      user: { select: { name: true, phone: true } },
    },
  })
  const byId = new Map(found.map(s => [s.id, s]))
  const rows = ordered.map(o => byId.get(o.id)).filter(s => s !== undefined)

  const now = Date.now()
  const items = rows.map(s => {
    const since = s.ereenArrivedAt ?? s.updatedAt
    return {
      id: s.id,
      trackCode: s.trackCode,
      phone: s.user?.phone ?? s.phone,
      name: s.user?.name ?? null,
      description: s.description,
      since,
      sinceApprox: !s.ereenArrivedAt,
      days: Math.floor((now - since.getTime()) / 86_400_000),
    }
  })
  return NextResponse.json({ total, items })
}

// Сонгосон ачааг устгана — зөвхөн энэ каргын, одоо ч Эрээнд ирсэн төлөвтэй бичлэгүүд
export async function DELETE(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const body = await req.json().catch(() => null) as { ids?: unknown; confirm?: unknown; note?: unknown } | null
  if (body?.confirm !== 'УСТГАХ') return NextResponse.json({ error: 'Баталгаажуулалт буруу' }, { status: 400 })
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) || null : null
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.map(Number).filter(n => Number.isInteger(n) && n > 0))]
    : []
  if (!ids.length) return NextResponse.json({ error: 'Устгах ачаа сонгоно уу' }, { status: 400 })
  if (ids.length > MAX) return NextResponse.json({ error: `Нэг удаад ${MAX} хүртэл ачаа устгана` }, { status: 400 })

  const where = { id: { in: ids }, cargoId: admin.cargoId!, status: 'EREEN_ARRIVED' as const }
  // Устгал, устгалын түүх, аудит нэг transaction-д — холболт тасарвал аль нь ч хэрэгжихгүй
  const count = await prisma.$transaction(async tx => {
    const targets = await tx.shipment.findMany({ where, select: DELETION_SNAPSHOT_SELECT })
    if (!targets.length) return 0
    await recordDeletions(tx, admin.cargoId!, targets, { id: admin.userId, name: admin.name }, 'ereen-by-day', note)
    const { count } = await tx.shipment.deleteMany({ where: { ...where, id: { in: targets.map(t => t.id) } } })
    const codes = targets.map(t => t.trackCode)
    await tx.adminAuditLog.create({
      data: {
        cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name,
        action: 'shipment:ereen-stale-deleted',
        detail: `${note ? `${note} · ` : ''}${count} ачаа: ${codes.slice(0, 50).join(', ')}${codes.length > 50 ? ` … +${codes.length - 50}` : ''}`,
      },
    })
    return count
  }, { timeout: 30_000 })
  return NextResponse.json({ count, skipped: ids.length - count })
}

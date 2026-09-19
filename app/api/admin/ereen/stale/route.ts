import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

const MAX = 500

// Эрээнд ирсэн төлөвт хамгийн удаан байгаа N ачаа — хуучин (огноогүй) бичлэг эхэнд.
// ereenArrivedAt 2026-06 сараас өмнө хадгалагддаггүй байсан тул тэдгээрт updatedAt-ыг ойролцоо огноо болгоно.
export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const limit = Math.min(MAX, Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get('limit')) || 20)))
  const where = { cargoId: admin.cargoId!, status: 'EREEN_ARRIVED' as const }

  // Эрэмбэ ба харуулах хоног нэг огноогоор: ereenArrivedAt, байхгүй бол updatedAt ((cargoId, status) индексээр ~1000 мөр эрэмбэлнэ)
  const [total, ordered] = await Promise.all([
    prisma.shipment.count({ where }),
    prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Shipment"
      WHERE "cargoId" = ${admin.cargoId!} AND status = 'EREEN_ARRIVED'
      ORDER BY COALESCE("ereenArrivedAt", "updatedAt") ASC, id ASC
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

  const body = await req.json().catch(() => null) as { ids?: unknown } | null
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.map(Number).filter(n => Number.isInteger(n) && n > 0))]
    : []
  if (!ids.length) return NextResponse.json({ error: 'Устгах ачаа сонгоно уу' }, { status: 400 })
  if (ids.length > MAX) return NextResponse.json({ error: `Нэг удаад ${MAX} хүртэл ачаа устгана` }, { status: 400 })

  const where = { id: { in: ids }, cargoId: admin.cargoId!, status: 'EREEN_ARRIVED' as const }
  // Устгал ба аудит нэг transaction-д — холболт тасарвал аль аль нь хэрэгжихгүй
  const count = await prisma.$transaction(async tx => {
    const targets = await tx.shipment.findMany({ where, select: { id: true, trackCode: true } })
    if (!targets.length) return 0
    const { count } = await tx.shipment.deleteMany({ where: { ...where, id: { in: targets.map(t => t.id) } } })
    const codes = targets.map(t => t.trackCode)
    await tx.adminAuditLog.create({
      data: {
        cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name,
        action: 'shipment:ereen-stale-deleted',
        detail: `${count} ачаа: ${codes.slice(0, 50).join(', ')}${codes.length > 50 ? ` … +${codes.length - 50}` : ''}`,
      },
    })
    return count
  })
  return NextResponse.json({ count, skipped: ids.length - count })
}

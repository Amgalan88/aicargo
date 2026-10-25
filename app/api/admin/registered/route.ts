import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { recordDeletions, DELETION_SNAPSHOT_SELECT } from '@/lib/shipment-deletion'

const PAGE_SIZE = 20

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || '1'))

  const where: any = { status: 'REGISTERED', cargoId: admin.cargoId! }
  if (q) {
    where.OR = [
      { trackCode: { contains: q.toUpperCase() } },
      { user: { phone: { contains: q } } },
      { user: { name: { contains: q } } },
    ]
  }

  const [total, items] = await Promise.all([
    prisma.shipment.count({ where }),
    prisma.shipment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        trackCode: true,
        description: true,
        createdAt: true,
        user: { select: { name: true, phone: true } },
      },
    }),
  ])

  return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE })
}

// DELETE { ids } — хэрэглэгчийн бүртгүүлсэн (Эрээнд хүрээгүй) ачааг устгана: буруу код, захиалгын дугаар,
// удаан хүлээгдсэн хуучин бүртгэл. Зөвхөн REGISTERED; устгалын түүх + аудитад бичнэ, хэрэглэгчид мэдэгдэхгүй.
export async function DELETE(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const body = await req.json().catch(() => ({}))
  const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, 200) : []
  if (!ids.length) return NextResponse.json({ error: 'Ачаа сонгоно уу' }, { status: 400 })
  const cargoId = admin.cargoId!

  const deleted = await prisma.$transaction(async tx => {
    const targets = await tx.shipment.findMany({ where: { id: { in: ids }, cargoId, status: 'REGISTERED' }, select: DELETION_SNAPSHOT_SELECT })
    if (!targets.length) return []
    await recordDeletions(tx, cargoId, targets, { id: admin.userId, name: admin.name }, 'registered')
    await tx.shipment.deleteMany({ where: { id: { in: targets.map(t => t.id) }, status: 'REGISTERED' } })
    await tx.adminAuditLog.create({
      data: {
        cargoId, userId: admin.userId, userName: admin.name, action: 'shipment:registered-deleted',
        detail: `${targets.length} ачаа · ${targets.map(t => `${t.trackCode}${t.user?.phone ? ' · ' + t.user.phone : ''}`).join(', ')}`.slice(0, 1000),
      },
    })
    return targets
  })
  return NextResponse.json({ ok: true, count: deleted.length })
}

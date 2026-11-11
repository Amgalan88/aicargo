import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { logAdminAction } from '@/lib/audit'
import { revertHandover, LoyaltyError } from '@/lib/loyalty'

const PAGE_SIZE = 20

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || '1'))

  const where: any = { status: 'PICKED_UP', cargoId: admin.cargoId! }
  if (q) {
    where.OR = [
      { phone: { contains: q } },
      { trackCode: { contains: q.toUpperCase() } },
    ]
  }

  const [total, items] = await Promise.all([
    prisma.shipment.count({ where }),
    prisma.shipment.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        trackCode: true,
        phone: true,
        adminPrice: true,
        adminNote: true,
        updatedAt: true,
      },
    }),
  ])

  return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE })
}

// PATCH /api/admin/history { id, wholeReceipt? } — revert PICKED_UP → ARRIVED
// Баримттай олголт бол баримт цуцлагдаж, оноо буцаагдана (lib/loyalty.revertHandover). Олон ачаатай баримтын
// нэг ачааг тусад нь буцаахгүй — 409 RECEIPT_MULTI, wholeReceipt=true бол баримтын бүх ачааг хамт буцаана.
export async function PATCH(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const body = await req.json().catch(() => ({}))
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })

  const me = await prisma.user.findUnique({ where: { id: admin.userId }, select: { phone: true } })
  let result
  try {
    result = await revertHandover(prisma, {
      cargoId: admin.cargoId!, actor: { id: admin.userId, name: admin.name, phone: me?.phone ?? null },
      shipmentId: id, wholeReceipt: body?.wholeReceipt === true,
    })
  } catch (e) {
    if (e instanceof LoyaltyError) return NextResponse.json({ error: e.message, details: e.details ?? null }, { status: e.status })
    throw e
  }
  const pts = [
    result.pointsReversed ? `−${result.pointsReversed} оноо` : null,
    result.pointsRefunded ? `+${result.pointsRefunded} оноо буцаав` : null,
  ].filter(Boolean)
  await logAdminAction(prisma, {
    cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name,
    action: 'shipment:revert-pickup',
    detail: [result.trackCodes.join(', '), result.receiptId ? `баримт №${result.receiptId} цуцлав` : null, ...pts].filter(Boolean).join(' · '),
  })
  return NextResponse.json({ ok: true, ...result })
}

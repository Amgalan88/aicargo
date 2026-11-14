import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { auditLater } from '@/lib/audit'
import { randomUUID } from 'node:crypto'
import { performHandover, LoyaltyError, cleanIds, cleanRedeem, pointsBalances } from '@/lib/loyalty'

// GET /api/admin/handover?q=phone_or_trackcode
// GET /api/admin/handover?summary=1
// GET /api/admin/handover?today=1
export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  if (req.nextUrl.searchParams.get('today')) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const todayShipments = await prisma.shipment.findMany({
      where: { status: 'PICKED_UP', updatedAt: { gte: start }, cargoId: admin.cargoId! },
      select: { adminPrice: true, phone: true },
    })
    const phones = new Set(todayShipments.map((s: { phone: string | null; adminPrice: unknown }) => s.phone ?? '—'))
    const totalValue = todayShipments.reduce((sum: number, s: { phone: string | null; adminPrice: unknown }) => sum + (s.adminPrice ? Number(s.adminPrice) : 0), 0)
    return NextResponse.json({
      shipments: todayShipments.length,
      customers: phones.size,
      value: totalValue,
    })
  }

  const summary = req.nextUrl.searchParams.get('summary')
  if (summary) {
    const PAGE = 20
    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || '1'))

    const all = await prisma.shipment.findMany({
      where: { status: 'ARRIVED', cargoId: admin.cargoId! },
      select: { id: true, trackCode: true, description: true, adminPrice: true, phone: true, adminNote: true },
      orderBy: { phone: 'asc' },
    })

    // Group by phone
    const map = new Map<string, { phone: string; count: number; total: number; shipments: typeof all }>()
    for (const s of all) {
      const key = s.phone ?? '—'
      if (!map.has(key)) map.set(key, { phone: key, count: 0, total: 0, shipments: [] })
      const g = map.get(key)!
      g.count++
      g.total += s.adminPrice ? Number(s.adminPrice) : 0
      g.shipments.push(s)
    }

    const allGroups = Array.from(map.values())
    const groups = allGroups.slice((page - 1) * PAGE, page * PAGE)

    return NextResponse.json({
      groups,
      totalGroups: allGroups.length,
      totalShipments: all.length,
      totalCustomers: allGroups.length,
      totalValue: all.reduce((s: number, r: { adminPrice: unknown }) => s + (r.adminPrice ? Number(r.adminPrice) : 0), 0),
      page,
      pageSize: PAGE,
    })
  }

  const q = req.nextUrl.searchParams.get('q') ?? req.nextUrl.searchParams.get('phone')
  if (!q) return NextResponse.json({ error: 'Утас эсвэл трак код оруулна уу' }, { status: 400 })

  const trimmed = q.trim()
  const isPhoneOnly = /^\d{8}$/.test(trimmed)
  const shipments = await prisma.shipment.findMany({
    where: {
      status: 'ARRIVED',
      cargoId: admin.cargoId!,
      OR: isPhoneOnly
        ? [{ phone: { contains: trimmed } }]
        : [
            { trackCode: { contains: trimmed.toUpperCase() } },
            { phone: { contains: trimmed } },
          ],
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(shipments)
}

// POST /api/admin/handover — bulk PICKED_UP
// Нэг транзакцид: ачааг түгжиж PICKED_UP болгох + утас бүрт олголтын баримт (HandoverReceipt) + урамшуулал (асаалттай бол).
// requestKey: нэг товч даралт — дахин илгээхэд давхар баримт, оноо үүсэхгүй (lib/loyalty.performHandover)
export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const body = await req.json().catch(() => ({}))
  const ids = cleanIds(body?.shipmentIds)
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Бараа сонгоно уу' }, { status: 400 })
  }
  const requestKey = typeof body.requestKey === 'string' && body.requestKey ? body.requestKey : randomUUID()
  const expectedNet = body.expectedNet && typeof body.expectedNet === 'object'
    ? Object.fromEntries(Object.entries(body.expectedNet as Record<string, unknown>).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]))
    : undefined

  const cargoId = admin.cargoId!
  const me = await prisma.user.findUnique({ where: { id: admin.userId }, select: { phone: true } })
  let result
  try {
    result = await performHandover(prisma, {
      cargoId, actor: { id: admin.userId, name: admin.name, phone: me?.phone ?? null },
      shipmentIds: ids, requestKey, redeem: cleanRedeem(body.redeem), expectedNet,
    })
  } catch (e) {
    if (e instanceof LoyaltyError) return NextResponse.json({ error: e.message, details: e.details ?? null }, { status: e.status })
    throw e
  }
  const { count, receipts } = result

  // Хэнд, ямар ачаа, ямар дүнтэй олгосныг (маргаан гарвал шалгахад) — хариу өгсний дараа бичнэ
  if (!result.replayed && count > 0) auditLater(async () => {
    const rows = await prisma.shipment.findMany({
      where: { receiptId: { in: receipts.map(r => r.id) }, cargoId },
      select: { trackCode: true },
    })
    const phones = [...new Set(receipts.map(r => r.phone).filter(Boolean))]
    const total = receipts.reduce((t, r) => t + r.grossMnt, 0)
    const discount = receipts.reduce((t, r) => t + r.vipDiscountMnt, 0)
    const redeemed = receipts.reduce((t, r) => t + r.pointsRedeemed, 0)
    const earned = receipts.reduce((t, r) => t + r.pointsEarned, 0)
    const codes = rows.map(r => r.trackCode)
    return {
      cargoId, userId: admin.userId, userName: admin.name,
      action: 'shipment:handover',
      detail: [
        `${count} ачаа`,
        phones.length ? phones.slice(0, 2).join(', ') + (phones.length > 2 ? ` +${phones.length - 2}` : '') : null,
        total > 0 ? '₮' + Math.round(total).toLocaleString('en-US') : null,
        discount > 0 ? `VIP −₮${Math.round(discount).toLocaleString('en-US')}` : null,
        redeemed > 0 ? `оноо −${redeemed}` : null,
        earned > 0 ? `+${earned} оноо` : null,
        codes.slice(0, 5).join(', ') + (codes.length > 5 ? ` +${codes.length - 5}` : ''),
      ].filter(Boolean).join(' · '),
    }
  })

  // Баримтын хураангуйд «шинэ үлдэгдэл» харуулна (алдаа гарвал олголтыг унагаахгүй)
  const balances = await pointsBalances(prisma, cargoId, receipts.map(r => r.phone)).catch(() => null)
  return NextResponse.json({ ok: true, count, receipts, balances, replayed: result.replayed })
}

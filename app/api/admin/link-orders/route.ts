import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { logAdminAction } from '@/lib/audit'
import { LINK_STATUSES, type LinkStatus } from '@/lib/link-orders'

// Админы линк захиалгын самбар: GET — жагсаалт + тоо, PATCH — үнэ илгээх / төлбөр орсон / захиалсан / цуцлах

async function admin(req: NextRequest) {
  const a = await getVerifiedUserFromRequest(req)
  if (!a) return { error: unauthorized() }
  if (a.role !== 'ADMIN' || !a.cargoId) return { error: forbidden() }
  return { a: a as typeof a & { cargoId: number } }
}

// Улаанбаатарын цагаар энэ сарын эхлэл
function ubMonthStart(): Date {
  const ub = new Date(Date.now() + 8 * 3_600_000)
  return new Date(Date.UTC(ub.getUTCFullYear(), ub.getUTCMonth(), 1) - 8 * 3_600_000)
}

export async function GET(req: NextRequest) {
  const r = await admin(req)
  if (r.error) return r.error
  const { cargoId } = r.a
  const sp = req.nextUrl.searchParams
  const st = sp.get('status')
  const status = st && (LINK_STATUSES as readonly string[]).includes(st) ? st : null
  const q = sp.get('q')?.trim()

  const where = {
    cargoId,
    ...(status ? { status } : { status: { not: 'CANCELLED' } }),
    ...(q ? { OR: [{ phone: { contains: q } }, { name: { contains: q, mode: 'insensitive' as const } }] } : {}),
  }
  const [items, byStatus, month, cargo] = await Promise.all([
    prisma.linkOrder.findMany({ where, orderBy: { id: 'desc' }, take: 300 }),
    prisma.linkOrder.groupBy({ by: ['status'], where: { cargoId }, _count: { _all: true } }),
    prisma.linkOrder.aggregate({ where: { cargoId, paidAt: { gte: ubMonthStart() } }, _sum: { paidAmount: true }, _count: { _all: true } }),
    prisma.cargo.findUnique({ where: { id: cargoId }, select: { linkOrdersEnabled: true } }),
  ])
  return NextResponse.json({
    enabled: !!cargo?.linkOrdersEnabled,
    items,
    counts: Object.fromEntries(byStatus.map(s => [s.status, s._count._all])),
    monthPaid: Number(month._sum.paidAmount ?? 0),
    monthPaidCount: month._count._all,
  })
}

interface Body {
  ids?: number[]
  action?: 'quote' | 'paid' | 'ordered' | 'cancel' | 'reopen'
  price?: number | string
  paidAmount?: number | string
  trackCode?: string
  note?: string
}

const FROM: Record<NonNullable<Body['action']>, LinkStatus[]> = {
  quote: ['NEW', 'QUOTED'],
  paid: ['QUOTED'],
  ordered: ['PAID'],
  cancel: ['NEW', 'QUOTED', 'PAID'],
  reopen: ['CANCELLED'],
}

export async function PATCH(req: NextRequest) {
  const r = await admin(req)
  if (r.error) return r.error
  const { a } = r
  const body = (await req.json().catch(() => ({}))) as Body
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean).slice(0, 100) : []
  if (!ids.length || !body.action || !(body.action in FROM)) return NextResponse.json({ error: 'Үйлдэл буруу' }, { status: 400 })

  const rows = await prisma.linkOrder.findMany({ where: { id: { in: ids }, cargoId: a.cargoId, status: { in: FROM[body.action] } } })
  if (!rows.length) return NextResponse.json({ error: 'Төлөв өөрчлөгдсөн байна. Хуудсаа шинэчилнэ үү' }, { status: 409 })
  const now = new Date()
  const note = body.note?.trim().slice(0, 300) || null
  let warning: string | null = null

  switch (body.action) {
    case 'quote': {
      const price = Number(body.price)
      if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: 'Үнэ оруулна уу' }, { status: 400 })
      await prisma.linkOrder.updateMany({
        where: { id: { in: rows.map(x => x.id) } },
        data: { status: 'QUOTED', price, quotedAt: now, ...(note ? { adminNote: note } : {}) },
      })
      break
    }
    case 'paid': {
      // Нэг бараа бол оруулсан дүнгээр, олон бол бараа бүр өөрийн үнээр
      const single = rows.length === 1 && body.paidAmount !== undefined && body.paidAmount !== ''
      const amount = single ? Number(body.paidAmount) : null
      if (single && (!Number.isFinite(amount) || amount! <= 0)) return NextResponse.json({ error: 'Төлсөн дүн буруу' }, { status: 400 })
      await prisma.$transaction(rows.map(x => prisma.linkOrder.update({
        where: { id: x.id },
        data: { status: 'PAID', paidAmount: amount ?? x.price, paidAt: now },
      })))
      const total = amount ?? rows.reduce((s, x) => s + Number(x.price ?? 0), 0)
      await logAdminAction(prisma, {
        cargoId: a.cargoId, userId: a.userId, userName: a.name,
        action: 'link-order:paid', detail: `${rows[0].name} ${rows[0].phone} · ${rows.length} бараа · ₮${Math.round(total).toLocaleString('en-US')}`,
      })
      break
    }
    case 'ordered': {
      const trackCode = body.trackCode?.trim().toUpperCase().slice(0, 60) || null
      await prisma.linkOrder.updateMany({
        where: { id: { in: rows.map(x => x.id) } },
        data: { status: 'ORDERED', orderedAt: now, ...(trackCode ? { trackCode } : {}) },
      })
      // Трак кодтой бол хэрэглэгчийн "Миний ачаа"-нд автоматаар бүртгэнэ
      const x = rows[0]
      if (trackCode && x.userId && rows.length === 1) {
        const existing = await prisma.shipment.findUnique({ where: { trackCode_cargoId: { trackCode, cargoId: a.cargoId } } })
        if (!existing) {
          await prisma.shipment.create({
            data: { trackCode, cargoId: a.cargoId, userId: x.userId, phone: x.phone, status: 'REGISTERED', description: x.note ?? null },
          })
        } else if (!existing.userId) {
          await prisma.shipment.update({ where: { id: existing.id }, data: { userId: x.userId, phone: existing.phone ?? x.phone } })
        } else if (existing.userId !== x.userId) {
          warning = 'Энэ трак код өөр хэрэглэгчид бүртгэлтэй байна — хэрэглэгчийн ачаанд нэмэгдээгүй'
        }
      }
      break
    }
    case 'cancel':
      await prisma.linkOrder.updateMany({ where: { id: { in: rows.map(x => x.id) } }, data: { status: 'CANCELLED', adminNote: note } })
      break
    case 'reopen':
      await prisma.linkOrder.updateMany({ where: { id: { in: rows.map(x => x.id) } }, data: { status: 'NEW', adminNote: null } })
      break
  }
  return NextResponse.json({ ok: true, count: rows.length, warning })
}

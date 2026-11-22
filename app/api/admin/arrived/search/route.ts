import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { ubDayRange } from '@/lib/ub-date'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const q = req.nextUrl.searchParams.get('q')?.trim()
  const statsOnly = req.nextUrl.searchParams.get('stats') === '1'
  const dateParam = req.nextUrl.searchParams.get('date')?.trim()
  // Зөвхөн 8 оронтой утга бол утас гэж үзнэ — урт тоон трак код (жш "465547193524742")
  // үүнд орохгүй тул трак кодоор нь зөв хайгдана
  const isPhone = q && /^\d{8}$/.test(q)

  // Өдрийн бүртгэл (?day=YYYY-MM-DD, байхгүй бол өнөөдөр) — УБ-ын бүтэн өдөр, ирсэн огноогоор.
  // Олгосон ачааг ч тоолно: өмнө нь зөвхөн «Ирсэн» төлөвтэйг, сервер UTC тул 08:00-оос, updatedAt-аар
  // тоолдог байсан тул олгох бүрт тоо, дүн хасагдаж, үнэ засахад өөр өдрийн ачаа «өнөөдөр» болдог байв
  const ubToday = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
  const dayRange = ubDayRange(req.nextUrl.searchParams.get('day') || ubToday)
  if (!dayRange) return NextResponse.json({ error: 'Огноо буруу байна' }, { status: 400 })
  const dayWhere = {
    status: { in: ['ARRIVED' as const, 'PICKED_UP' as const] },
    cargoId: admin.cargoId!,
    arrivedAt: { gte: dayRange.start, lte: dayRange.end },
  }

  if (statsOnly) {
    const rows = await prisma.shipment.findMany({
      where: dayWhere,
      select: { adminPrice: true },
    })
    const count = rows.length
    const total = rows.reduce((s, r) => s + (r.adminPrice ? Number(r.adminPrice) : 0), 0)
    const noPrice = rows.filter(r => !r.adminPrice).length
    return NextResponse.json({ count, total, noPrice })
  }

  // Огноогоор bulk буцаах хэсэгт урьдчилан хэдэн бараа тохирохыг харуулна
  if (dateParam) {
    // Буцаалттай ижил өдөр (УБ цагаар); ereenArrivedAt — хэд нь Эрээнд, хэд нь Бүртгүүлсэн рүү буцахыг харуулна
    const range = ubDayRange(dateParam)
    if (!range) return NextResponse.json({ error: 'Огноо буруу байна' }, { status: 400 })
    const shipments = await prisma.shipment.findMany({
      where: { status: 'ARRIVED', cargoId: admin.cargoId!, arrivedAt: { gte: range.start, lte: range.end } },
      orderBy: { arrivedAt: 'desc' },
      select: {
        id: true, trackCode: true, phone: true, adminPrice: true, adminNote: true,
        createdAt: true, updatedAt: true, description: true, ereenArrivedAt: true, arrivedAt: true,
        user: { select: { name: true, phone: true } },
      },
    })
    return NextResponse.json(shipments)
  }

  const shipments = await prisma.shipment.findMany({
    where: q
      ? { status: 'ARRIVED', cargoId: admin.cargoId!, ...(isPhone ? { phone: { contains: q } } : { trackCode: { contains: q.toUpperCase() } }) }
      : dayWhere,
    orderBy: q ? { updatedAt: 'desc' } : { arrivedAt: 'desc' },
    ...(!q ? {} : { take: 50 }),
    select: {
      id: true,
      trackCode: true,
      phone: true,
      adminPrice: true,
      adminNote: true,
      createdAt: true,
      updatedAt: true,
      description: true,
      user: { select: { name: true, phone: true } },
    },
  })

  return NextResponse.json(shipments)
}

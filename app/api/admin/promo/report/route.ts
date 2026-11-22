import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { promoReport } from '@/lib/promo'
import { promoGuard } from '../guard'

// GET ?month=YYYY-MM — код бүрийн сарын шимтгэл (гишүүдийн бодит төлсөн дүнгээр), гишүүн бүрийн задаргаатай
export async function GET(req: NextRequest) {
  const g = await promoGuard(req)
  if (g.error) return g.error
  const report = await promoReport(prisma, g.cargoId, req.nextUrl.searchParams.get('month') ?? '')
  if (!report) return NextResponse.json({ error: 'Сар буруу' }, { status: 400 })
  return NextResponse.json({ codes: report })
}

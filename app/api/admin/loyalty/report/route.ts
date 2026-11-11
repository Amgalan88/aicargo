import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { monthlyReport } from '@/lib/loyalty-db'
import { ubMonthRange, ubMonthOf } from '@/lib/loyalty'

// GET /api/admin/loyalty/report?month=2026-11 (Улаанбаатарын цагаар)
export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  const month = req.nextUrl.searchParams.get('month') || ubMonthOf(new Date())
  const range = ubMonthRange(month)
  if (!range) return NextResponse.json({ error: 'Сар буруу (YYYY-MM)' }, { status: 400 })
  return NextResponse.json({ month, ...(await monthlyReport(prisma, admin.cargoId!, range)) })
}

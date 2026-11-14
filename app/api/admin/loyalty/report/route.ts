import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { monthlyReport, LoyaltyError } from '@/lib/loyalty'
import { ubMonthOf } from '@/lib/loyalty-core'

// GET ?month=YYYY-MM (УБ цагаар) — сарын урамшууллын тайлан
export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  const month = req.nextUrl.searchParams.get('month') || ubMonthOf(new Date())
  try {
    return NextResponse.json(await monthlyReport(prisma, admin.cargoId!, month))
  } catch (e) {
    if (e instanceof LoyaltyError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}

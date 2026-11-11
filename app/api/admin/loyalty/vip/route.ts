import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { vipList, setManualVip, refreshAutoTiers } from '@/lib/loyalty-db'
import { loyaltyErrorResponse } from '@/lib/loyalty-http'

// GET /api/admin/loyalty/vip?pct=3&q=9911
export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  const pctRaw = req.nextUrl.searchParams.get('pct')
  const pct = pctRaw ? Number(pctRaw) : null
  const r = await vipList(prisma, admin.cargoId!, new Date(), {
    pct: pct != null && Number.isInteger(pct) ? pct : null, q: req.nextUrl.searchParams.get('q')?.trim() || null,
  })
  return NextResponse.json({ vipEnabled: r.config.vipEnabled, tiers: r.config.vipTiers, counts: r.counts, rows: r.rows, canEdit: !admin.isStaffAdmin })
}

// POST { phone, pct: 1..5 | null, note, until?: YYYY-MM-DD } — гараар VIP оноох/цуцлах. Зөвхөн эзэмшигч, шалтгаан заавал
export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' || admin.isStaffAdmin) return forbidden()
  const body = await req.json().catch(() => ({}))
  const me = await prisma.user.findUnique({ where: { id: admin.userId }, select: { phone: true } })
  try {
    const account = await setManualVip(prisma, admin.cargoId!, { id: admin.userId, name: admin.name, phone: me?.phone }, body)
    return NextResponse.json({ ok: true, account })
  } catch (e) {
    return loyaltyErrorResponse(e)
  }
}

// PATCH — автомат шатыг одоо дахин тооцох (cron өдөрт нэг удаа ажилладаг)
export async function PATCH(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  const r = await refreshAutoTiers(prisma, admin.cargoId!)
  return NextResponse.json({ ok: true, ...r })
}

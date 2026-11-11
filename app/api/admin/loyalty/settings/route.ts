import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { loadConfig, saveSettings } from '@/lib/loyalty-db'
import { parseLoyaltySettingsInput, VIP_WINDOW_DAYS, VIP_GRACE_DAYS, POINTS_EXPIRY_DAYS, MAX_REDEEM_PCT } from '@/lib/loyalty'

const RULES = { vipWindowDays: VIP_WINDOW_DAYS, vipGraceDays: VIP_GRACE_DAYS, pointsExpiryDays: POINTS_EXPIRY_DAYS, maxRedeemPct: MAX_REDEEM_PCT }

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  const config = await loadConfig(prisma, admin.cargoId!)
  return NextResponse.json({ ...config, rules: RULES, canEdit: !admin.isStaffAdmin })
}

// Урамшууллыг асаах, хувь, босго, онооны ханшийг зөвхөн каргоны эзэмшигч өөрчилнө
export async function PUT(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' || admin.isStaffAdmin) return forbidden()

  const current = await loadConfig(prisma, admin.cargoId!)
  const parsed = parseLoyaltySettingsInput(await req.json().catch(() => null), current)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const config = await saveSettings(prisma, admin.cargoId!, { id: admin.userId, name: admin.name }, parsed.value)
  return NextResponse.json({ ...config, rules: RULES, canEdit: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { logAdminAction } from '@/lib/audit'
import { getLoyaltyConfig, saveLoyaltyConfig } from '@/lib/loyalty'
import { validateConfigInput, type LoyaltyConfig } from '@/lib/loyalty-core'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  const cfg = await getLoyaltyConfig(prisma, admin.cargoId!)
  return NextResponse.json({ ...cfg, canEdit: !admin.isStaffAdmin })
}

// Горим асаах/унтраах, хувь өөрчлөх — зөвхөн каргоны эзэмшигч (ажилтан admin биш)
export async function PUT(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  const cargoId = admin.cargoId!
  if (admin.isStaffAdmin) {
    await logAdminAction(prisma, { cargoId, userId: admin.userId, userName: admin.name, action: 'settings:permission-denied', detail: 'оролдсон: урамшууллын тохиргоо' })
    return forbidden()
  }
  const body = await req.json().catch(() => null)
  const prev = await getLoyaltyConfig(prisma, cargoId)
  const v = validateConfigInput(body, prev)
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  await saveLoyaltyConfig(prisma, cargoId, v.value, { id: admin.userId, name: admin.name, phone: null })
  const changed = describe(prev, v.value)
  if (changed) await logAdminAction(prisma, { cargoId, userId: admin.userId, userName: admin.name, action: 'loyalty:settings', detail: changed })
  return NextResponse.json({ ...v.value, canEdit: true })
}

const LABELS: Record<keyof LoyaltyConfig, string> = {
  pointsEnabled: 'Карго оноо', vipEnabled: 'VIP хөнгөлөлт', earnMntPerPoint: '1 оноо авах дүн', pointValueMnt: '1 онооны үнэ',
  pointsExpiryDays: 'Онооны хугацаа', maxRedeemPct: 'Оноогоор төлөх дээд %', vipWindowDays: 'VIP тооцох хоног',
  vipGraceDays: 'Шат хадгалах хоног', vipTiers: 'VIP шат',
}
function describe(a: LoyaltyConfig, b: LoyaltyConfig): string {
  const out: string[] = []
  for (const k of Object.keys(LABELS) as (keyof LoyaltyConfig)[]) {
    const x = JSON.stringify(a[k]), y = JSON.stringify(b[k])
    if (x === y) continue
    const show = (v: unknown) => typeof v === 'boolean' ? (v ? 'асаасан' : 'унтраасан')
      : Array.isArray(v) ? v.map(t => `₮${t.minSpend.toLocaleString('en-US')}→${t.pct}%`).join(', ') : String(v)
    out.push(`${LABELS[k]}: ${show(a[k])} → ${show(b[k])}`)
  }
  return out.join('; ')
}

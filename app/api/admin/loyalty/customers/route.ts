import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { logAdminAction } from '@/lib/audit'
import { parsePhone } from '@/lib/phone'
import { getLoyaltyConfig, listLoyaltyCustomers, loadCustomerStates, setManualVip } from '@/lib/loyalty'

// GET ?q=утас — VIP / онооны жагсаалт. GET ?phone=99112233 — нэг хэрэглэгчийн дэлгэрэнгүй (дэвтэр, баримт)
export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  const cargoId = admin.cargoId!
  const cfg = await getLoyaltyConfig(prisma, cargoId)
  const now = new Date()
  const phone = parsePhone(req.nextUrl.searchParams.get('phone'))
  if (phone) {
    const st = (await loadCustomerStates(prisma, cargoId, cfg, [phone], now)).get(phone)!
    const [ledger, receipts] = await Promise.all([
      prisma.loyaltyLedger.findMany({
        where: { cargoId, account: { phone, cargoId } }, orderBy: { id: 'desc' }, take: 100,
        select: { id: true, kind: true, points: true, createdAt: true, expiresAt: true, receiptId: true, note: true, actorName: true },
      }),
      prisma.handoverReceipt.findMany({
        where: { cargoId, phone }, orderBy: { id: 'desc' }, take: 30,
        select: { id: true, createdAt: true, itemCount: true, grossMnt: true, vipPct: true, vipDiscountMnt: true, pointsRedeemed: true, pointsRedeemedMnt: true, pointsEarned: true, netMnt: true, createdByName: true, loyaltyNote: true },
      }),
    ])
    return NextResponse.json({ config: cfg, customer: st, ledger, receipts })
  }
  const rows = await listLoyaltyCustomers(prisma, cargoId, cfg, now, { q: req.nextUrl.searchParams.get('q') ?? undefined })
  return NextResponse.json({ config: cfg, canEdit: !admin.isStaffAdmin, rows: rows.slice(0, 500), total: rows.length })
}

// PATCH { phone, pct: 1..5 | null, note, until?: 'YYYY-MM-DD' } — гараар VIP оноох/цуцлах. Зөвхөн эзэмшигч, шалтгаан заавал
export async function PATCH(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  const cargoId = admin.cargoId!
  if (admin.isStaffAdmin) {
    await logAdminAction(prisma, { cargoId, userId: admin.userId, userName: admin.name, action: 'settings:permission-denied', detail: 'оролдсон: гараар VIP оноох' })
    return forbidden()
  }
  const body = await req.json().catch(() => ({}))
  const phone = parsePhone(body.phone)
  if (!phone) return NextResponse.json({ error: 'Утасны дугаар буруу' }, { status: 400 })
  const pct = body.pct === null || body.pct === '' || body.pct === 0 ? null : Number(body.pct)
  if (pct !== null && (!Number.isInteger(pct) || pct < 1 || pct > 5)) return NextResponse.json({ error: 'Хувь 1–5 байна' }, { status: 400 })
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : ''
  if (pct !== null && !note) return NextResponse.json({ error: 'Шалтгаан бичнэ үү' }, { status: 400 })
  let until: Date | null = null
  if (pct !== null && body.until) {
    if (typeof body.until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.until)) return NextResponse.json({ error: 'Дуусах огноо буруу' }, { status: 400 })
    until = new Date(`${body.until}T23:59:59.999+08:00`)
    if (isNaN(until.getTime()) || until.getTime() <= Date.now()) return NextResponse.json({ error: 'Дуусах огноо ирээдүйд байх ёстой' }, { status: 400 })
  }
  const me = await prisma.user.findUnique({ where: { id: admin.userId }, select: { phone: true } })
  if (pct !== null && me?.phone === phone) return NextResponse.json({ error: 'Өөрийн утсанд VIP оноох боломжгүй' }, { status: 400 })
  const prev = await prisma.loyaltyAccount.findUnique({ where: { cargoId_phone: { cargoId, phone } }, select: { vipManualPct: true } })
  const acc = await setManualVip(prisma, cargoId, phone, { pct, note: note || null, until }, { id: admin.userId, name: admin.name, phone: me?.phone ?? null })
  await logAdminAction(prisma, {
    cargoId, userId: admin.userId, userName: admin.name, action: 'loyalty:vip-manual',
    detail: `${phone}: ${prev?.vipManualPct ? prev.vipManualPct + '%' : '—'} → ${pct ? pct + '%' : 'цуцалсан'}${until ? ` (${body.until} хүртэл)` : ''}${note ? ` · ${note}` : ''}`,
  })
  return NextResponse.json(acc)
}

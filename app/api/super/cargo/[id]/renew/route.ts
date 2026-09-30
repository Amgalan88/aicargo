import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { logAdminAction } from '@/lib/audit'
import { renewedUntil, formatBillingDate, PERIOD_DAYS, PRICE_PER_PERIOD } from '@/lib/billing'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// POST /api/super/cargo/[id]/renew — вэбсайтын төлбөр бүртгэх.
// Шинэ огноог дүрмээр (lib/billing) сервер тооцно: хаагдсан хугацаа тооцогдохгүй, ашигласан хоног хасагдана.
// paidOn — төлбөр орсон өдөр (хожуу бүртгэсэн ч тухайн өдрөөр тооцно)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const cargoId = Number((await params).id)
  const body = await req.json().catch(() => null) as { periods?: number; paidOn?: string } | null
  const periods = Math.floor(Number(body?.periods))
  if (!cargoId || !periods || periods < 1 || periods > 24) return NextResponse.json({ error: 'Сарын тоо буруу' }, { status: 400 })
  if (!body?.paidOn || !DATE_RE.test(body.paidOn)) return NextResponse.json({ error: 'Төлсөн огноо буруу' }, { status: 400 })
  const paidOn = new Date(`${body.paidOn}T00:00:00Z`)
  if (Number.isNaN(paidOn.getTime()) || paidOn.getTime() > Date.now() + 86_400_000) {
    return NextResponse.json({ error: 'Төлсөн огноо ирээдүйд байж болохгүй' }, { status: 400 })
  }

  const cargo = await prisma.cargo.findUnique({ where: { id: cargoId }, select: { paidUntil: true } })
  if (!cargo) return NextResponse.json({ error: 'Карго олдсонгүй' }, { status: 404 })

  const until = renewedUntil(cargo.paidUntil, periods, paidOn)
  // Зэрэг хоёр бүртгэлээс хамгаалж хуучин утга өөрчлөгдөөгүй байхад л шинэчилнэ
  const res = await prisma.cargo.updateMany({ where: { id: cargoId, paidUntil: cargo.paidUntil }, data: { paidUntil: until } })
  if (res.count !== 1) return NextResponse.json({ error: 'Өөр хүн зэрэг шинэчилсэн байна. Хуудсаа сэргээнэ үү' }, { status: 409 })

  await logAdminAction(prisma, {
    cargoId, userId: user.userId, userName: user.name,
    action: 'billing:renewed',
    detail: `${(periods * PRICE_PER_PERIOD).toLocaleString('en-US')}₮ · ${periods * PERIOD_DAYS} хоног · төлсөн ${body.paidOn} · ${cargo.paidUntil ? formatBillingDate(cargo.paidUntil) : '—'} → ${formatBillingDate(until)}`,
  })
  return NextResponse.json({ paidUntil: until.toISOString() })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized } from '@/lib/auth'
import { sanitizeItems, MAX_ITEMS_PER_DAY } from '@/lib/link-orders'
import { uploadLinkOrderImage } from '@/lib/cloudinary'

// Хэрэглэгчийн линк захиалга: GET — өөрийн жагсаалт, POST — шинэ линкүүд, DELETE — шинэ (үнэ ирээгүй) захиалгаа цуцлах,
// PATCH { on } — линк захиалгаа өөрөө асаах / унтраах

const SELECT = {
  id: true, url: true, quantity: true, note: true, imageUrl: true, status: true, price: true, paidAmount: true,
  paidAt: true, quotedAt: true, orderedAt: true, trackCode: true, adminNote: true, createdAt: true,
} as const

async function enabledCargo(cargoId: number | null) {
  if (!cargoId) return null
  const cargo = await prisma.cargo.findUnique({ where: { id: cargoId }, select: { id: true, linkOrdersEnabled: true } })
  return cargo?.linkOrdersEnabled ? cargo : null
}

export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (!user.cargoId) return NextResponse.json([])
  const items = await prisma.linkOrder.findMany({
    where: { userId: user.userId, cargoId: user.cargoId },
    orderBy: { id: 'desc' },
    take: 200,
    select: SELECT,
  })
  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  const cargo = await enabledCargo(user.cargoId)
  if (!cargo) return NextResponse.json({ error: 'Энэ карго линкээр захиалга авдаггүй' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { items, error } = sanitizeItems(body.items)
  if (error) return NextResponse.json({ error }, { status: 400 })

  // Хэт олон хүсэлтээс сэргийлнэ
  const today = await prisma.linkOrder.count({
    where: { userId: user.userId, createdAt: { gt: new Date(Date.now() - 86_400_000) } },
  })
  if (today + items.length > MAX_ITEMS_PER_DAY) {
    return NextResponse.json({ error: `Өдөрт ${MAX_ITEMS_PER_DAY} хүртэл линк илгээнэ` }, { status: 429 })
  }

  const me = await prisma.user.findUnique({ where: { id: user.userId }, select: { name: true, phone: true, linkOrdersOn: true } })
  if (!me) return unauthorized()
  if (!me.linkOrdersOn) return NextResponse.json({ error: 'Линк захиалга унтраалттай байна. Эхлээд асаана уу' }, { status: 403 })

  // Сонголтын зургуудыг зэрэг байршуулна
  let images: (string | null)[]
  try {
    images = await Promise.all(items.map(i => (i.image ? uploadLinkOrderImage(i.image, cargo.id) : Promise.resolve(null))))
  } catch {
    return NextResponse.json({ error: 'Зураг байршуулахад алдаа гарлаа. Дахин оролдоно уу' }, { status: 500 })
  }
  await prisma.linkOrder.createMany({
    data: items.map((i, k) => ({
      cargoId: cargo.id, userId: user.userId, name: me.name, phone: me.phone,
      url: i.url, quantity: i.quantity, note: i.note || null, imageUrl: images[k],
    })),
  })
  return NextResponse.json({ ok: true, count: items.length }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const on = body.on === true
  // Асаахад карго линк захиалга авдаг байх ёстой; унтраахыг үргэлж зөвшөөрнө
  if (on && !(await enabledCargo(user.cargoId))) return NextResponse.json({ error: 'Энэ карго линкээр захиалга авдаггүй' }, { status: 403 })
  await prisma.user.update({ where: { id: user.userId }, data: { linkOrdersOn: on } })
  return NextResponse.json({ ok: true, on })
}

export async function DELETE(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const id = Number(body.id)
  if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })
  // Үнэ ирээгүй байхад л хэрэглэгч өөрөө цуцална
  const r = await prisma.linkOrder.updateMany({
    where: { id, userId: user.userId, status: 'NEW' },
    data: { status: 'CANCELLED', adminNote: 'Хэрэглэгч өөрөө цуцалсан' },
  })
  if (!r.count) return NextResponse.json({ error: 'Цуцлах боломжгүй' }, { status: 409 })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized } from '@/lib/auth'

// Хэрэглэгчийн төхөөрөмжийн push бүртгэл: POST — асаах (бүртгэх), DELETE — унтраах
// Нэг төхөөрөмж (endpoint) нэг л хэрэглэгчид харьяална — өөр хүн нэвтэрвэл шилжинэ

export async function POST(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (!user.cargoId) return NextResponse.json({ error: 'Карго олдсонгүй' }, { status: 400 })
  const body = await req.json().catch(() => ({}))
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : ''
  const auth = typeof body.keys?.auth === 'string' ? body.keys.auth : ''
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    return NextResponse.json({ error: 'Бүртгэл буруу' }, { status: 400 })
  }
  const userAgent = req.headers.get('user-agent')?.slice(0, 300) ?? null
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.userId, cargoId: user.cargoId, p256dh, auth, userAgent },
    create: { endpoint, userId: user.userId, cargoId: user.cargoId, p256dh, auth, userAgent },
  })
  // Нэг төхөөрөмж/хөтөч дахин бүртгэгдвэл хуучин бүртгэлийг нь устгана — мэдэгдэл давхар ирэхээс сэргийлнэ
  if (userAgent) {
    await prisma.pushSubscription.deleteMany({ where: { userId: user.userId, userAgent, endpoint: { not: endpoint } } })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.userId } })
  return NextResponse.json({ ok: true })
}

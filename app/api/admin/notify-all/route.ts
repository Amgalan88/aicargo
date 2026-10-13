import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { sendPushToUsers, pushConfigured } from '@/lib/push'

// "Ирсэн" ачаатай хэрэглэгчдэд push мэдэгдэл илгээнэ (өмнө нь и-мэйл — lib/mail sendNotificationEmail түр хэрэглэгдэхгүй).
// 12 цагт нэг удаа.

const NOTIFY_INTERVAL_MS = 12 * 60 * 60 * 1000 // 12 цаг

async function guard(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return { error: unauthorized() }
  if ((admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') || !admin.cargoId) return { error: forbidden() }
  return { admin: admin as typeof admin & { cargoId: number } }
}

// Ирсэн ачаатай хэрэглэгчид ба тэдний дундаас мэдэгдэл асаасан нь
function arrivedUsers(cargoId: number) {
  return { cargoId, shipments: { some: { status: 'ARRIVED' as const, cargoId } } }
}

export async function GET(req: NextRequest) {
  const g = await guard(req)
  if (g.error) return g.error
  const { cargoId } = g.admin

  const [cargo, total, count] = await Promise.all([
    (prisma.cargo.findUnique as any)({ where: { id: cargoId }, select: { lastNotifiedAt: true } }),
    prisma.user.count({ where: arrivedUsers(cargoId) }),
    prisma.user.count({ where: { ...arrivedUsers(cargoId), pushSubscriptions: { some: {} } } }),
  ])

  const lastNotifiedAt = cargo?.lastNotifiedAt ? new Date(cargo.lastNotifiedAt) : null
  const nextAllowedAt = lastNotifiedAt ? new Date(lastNotifiedAt.getTime() + NOTIFY_INTERVAL_MS) : null
  const canSend = !nextAllowedAt || new Date() >= nextAllowedAt
  return NextResponse.json({ count, total, canSend, lastNotifiedAt, nextAllowedAt, configured: pushConfigured() })
}

export async function POST(req: NextRequest) {
  const g = await guard(req)
  if (g.error) return g.error
  const { cargoId } = g.admin
  if (!pushConfigured()) return NextResponse.json({ error: 'Push мэдэгдлийн тохиргоо хийгдээгүй байна' }, { status: 503 })

  const cargo = await (prisma.cargo.findUnique as any)({
    where: { id: cargoId },
    select: { name: true, lastNotifiedAt: true },
  })

  const lastNotifiedAt = cargo?.lastNotifiedAt ? new Date(cargo.lastNotifiedAt) : null
  if (lastNotifiedAt && Date.now() - lastNotifiedAt.getTime() < NOTIFY_INTERVAL_MS) {
    const nextAt = new Date(lastNotifiedAt.getTime() + NOTIFY_INTERVAL_MS)
    return NextResponse.json({ error: `12 цагт нэг л удаа илгээх боломжтой. Дараагийн илгээлт: ${nextAt.toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ulaanbaatar' })}` }, { status: 429 })
  }

  const cargoName: string = cargo?.name ?? 'Cargo'
  const body = await req.json().catch(() => ({}))
  const closingTime: string = /^\d{1,2}:\d{2}$/.test(body.closingTime) ? body.closingTime : '18:00'

  const users = await prisma.user.findMany({
    where: { ...arrivedUsers(cargoId), pushSubscriptions: { some: {} } },
    select: {
      id: true, phone: true,
      shipments: { where: { status: 'ARRIVED', cargoId }, select: { adminPrice: true } },
    },
  })

  // И-мэйлтэй яг адил агуулга
  const messages = users.map(u => {
    const n = u.shipments.length
    const total = u.shipments.reduce((s, x) => s + (x.adminPrice ? Number(x.adminPrice) : 0), 0)
    return {
      userId: u.id,
      payload: {
        kind: 'arrived' as const,
        tag: 'arrived',
        title: `📦 Таны ${n} ачаа ирлээ`,
        body: `Таны ${u.phone} дугаар дээр ${n} ачаа ирсэн байна.${total > 0 ? ` Нийт ₮${Math.round(total).toLocaleString('en-US')}.` : ''} ${cargoName} өнөөдөр ${closingTime} хүртэл ажиллаж байна.`,
        url: '/orders',
      },
    }
  })

  const { users: sent } = await sendPushToUsers(messages)
  if (sent > 0) {
    await (prisma.cargo.update as any)({ where: { id: cargoId }, data: { lastNotifiedAt: new Date() } })
  }
  return NextResponse.json({ sent, failed: users.length - sent })
}

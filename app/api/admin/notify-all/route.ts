import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { sendNotificationEmail } from '@/lib/mail'

const NOTIFY_INTERVAL_MS = 12 * 60 * 60 * 1000 // 12 цаг

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') return forbidden()

  const cargo = await (prisma.cargo.findUnique as any)({
    where: { id: admin.cargoId! },
    select: { lastNotifiedAt: true },
  })

  const lastNotifiedAt = cargo?.lastNotifiedAt ? new Date(cargo.lastNotifiedAt) : null
  const nextAllowedAt = lastNotifiedAt ? new Date(lastNotifiedAt.getTime() + NOTIFY_INTERVAL_MS) : null
  const canSend = !nextAllowedAt || new Date() >= nextAllowedAt

  const count = await prisma.user.count({
    where: {
      cargoId: admin.cargoId!,
      email: { not: null },
      shipments: { some: { status: 'ARRIVED', cargoId: admin.cargoId! } },
    },
  })
  return NextResponse.json({ count, canSend, lastNotifiedAt, nextAllowedAt })
}

export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') return forbidden()

  // 12 цасын хязгаар шалгах
  const cargo = await (prisma.cargo.findUnique as any)({
    where: { id: admin.cargoId! },
    select: { name: true, lastNotifiedAt: true },
  })

  const lastNotifiedAt = cargo?.lastNotifiedAt ? new Date(cargo.lastNotifiedAt) : null
  if (lastNotifiedAt && new Date().getTime() - lastNotifiedAt.getTime() < NOTIFY_INTERVAL_MS) {
    const nextAt = new Date(lastNotifiedAt.getTime() + NOTIFY_INTERVAL_MS)
    return NextResponse.json({ error: `12 цагт нэг л удаа илгээх боломжтой. Дараагийн илгээлт: ${nextAt.toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit' })}` }, { status: 429 })
  }

  const cargoName: string = cargo?.name ?? 'Cargo'

  const usersWithCargo = await prisma.user.findMany({
    where: {
      cargoId: admin.cargoId!,
      email: { not: null },
      shipments: { some: { status: 'ARRIVED', cargoId: admin.cargoId! } },
    },
    include: {
      shipments: { where: { status: 'ARRIVED', cargoId: admin.cargoId! } },
    },
  })

  const body = await req.json().catch(() => ({}))
  const closingTime: string = body.closingTime || '18:00'

  let sent = 0
  let noEmail = 0
  let failed = 0

  for (const user of usersWithCargo) {
    if (!user.email) { noEmail++; continue }
    const cargoCount = user.shipments.length
    const totalAmount = user.shipments.reduce((sum: number, s: { adminPrice: unknown }) => {
      return sum + (s.adminPrice ? Number(s.adminPrice) : 0)
    }, 0)
    try {
      await sendNotificationEmail(user.email, user.name, user.phone, cargoCount, totalAmount, closingTime, cargoName)
      sent++
    } catch (err) {
      failed++
      console.error('Mail error for', user.email, err)
    }
  }

  // Амжилттай илгээсэн бол lastNotifiedAt шинэчлэх
  if (sent > 0) {
    await (prisma.cargo.update as any)({ where: { id: admin.cargoId! }, data: { lastNotifiedAt: new Date() } })
  }

  return NextResponse.json({ sent, noEmail, failed })
}

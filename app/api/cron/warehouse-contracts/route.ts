import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PAYMENT_WAIT_DAYS } from '@/lib/contract'
import { addEvent, notifyParty } from '@/lib/contract-server'

export const maxDuration = 60

const SYSTEM = { id: null, name: 'Систем' }
const GUEST_DRAFT_DAYS = 14

// Өдөр бүр: 30 хоногийн мэдэгдлийн хугацаа дууссан гэрээг цуцална, удаан төлөгдөөгүй гэрээг хаана
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const now = new Date()

  const due = await prisma.warehouseContract.findMany({
    where: { status: 'TERMINATION_PENDING', terminationEffectiveAt: { lte: now } },
    select: { id: true, contractNo: true, cargoId: true, guestEmail: true, accessToken: true },
  })
  let terminated = 0
  for (const c of due) {
    const ok = await prisma.$transaction(async tx => {
      const r = await tx.warehouseContract.updateMany({
        where: { id: c.id, status: 'TERMINATION_PENDING' },
        data: { status: 'TERMINATED', terminatedAt: now },
      })
      if (r.count === 1) await addEvent(tx, c.id, SYSTEM, 'TERMINATED', 'Мэдэгдлийн хугацаа дууссан')
      return r.count === 1
    })
    if (!ok) continue
    terminated++
    await notifyParty(c, `Гэрээ ${c.contractNo} цуцлагдлаа`, [
      `${c.contractNo} гэрээний цуцлах мэдэгдлийн хугацаа дуусч, гэрээ цуцлагдлаа.`,
    ])
  }

  const unpaidBefore = new Date(now.getTime() - PAYMENT_WAIT_DAYS * 86_400_000)
  const stale = await prisma.warehouseContract.findMany({
    where: { status: 'AWAITING_PAYMENT', cargoSignedAt: { lte: unpaidBefore } },
    select: { id: true, contractNo: true, cargoId: true, guestEmail: true, accessToken: true },
  })
  let expired = 0
  for (const c of stale) {
    const reason = `${PAYMENT_WAIT_DAYS} хоногийн дотор төлбөр ороогүй`
    const ok = await prisma.$transaction(async tx => {
      const r = await tx.warehouseContract.updateMany({
        where: { id: c.id, status: 'AWAITING_PAYMENT' },
        data: { status: 'REJECTED', rejectReason: reason },
      })
      if (r.count === 1) await addEvent(tx, c.id, SYSTEM, 'EXPIRED_UNPAID', reason)
      return r.count === 1
    })
    if (!ok) continue
    expired++
    await notifyParty(c, `Гэрээ ${c.contractNo} хаагдлаа`, [
      `${c.contractNo} гэрээний төлбөр ${PAYMENT_WAIT_DAYS} хоногийн дотор ороогүй тул хаагдлаа. Шаардлагатай бол шинээр гэрээ байгуулна уу.`,
    ])
  }

  // Хөндөгдөөгүй зочны ноорог — и-мэйл оруулаад орхисон хүсэлтүүд
  const staleDrafts = await prisma.warehouseContract.deleteMany({
    where: { status: 'DRAFT', cargoId: null, updatedAt: { lte: new Date(now.getTime() - GUEST_DRAFT_DAYS * 86_400_000) } },
  })

  return NextResponse.json({ terminated, expired, guestDraftsDeleted: staleDrafts.count })
}

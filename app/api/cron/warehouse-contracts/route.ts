import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PAYMENT_WAIT_DAYS } from '@/lib/contract'
import { addEvent, notifyParty } from '@/lib/contract-server'

export const maxDuration = 60

const SYSTEM = { id: null, name: 'Систем' }
const GUEST_DRAFT_DAYS = 14
// Төлбөрийн сануулга хүсэлт илгээснээс хойш эдгээр хоногт (нэг удаа тус бүр)
const REMINDER_DAYS = [1, 3]

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

  // Төлбөрийн сануулга — хүсэлт илгээснээс 1 ба 3 хоногийн дараа (нийт 2 удаа), төлбөр ороогүй бол
  const unpaid = await prisma.warehouseContract.findMany({
    where: { status: 'AWAITING_PAYMENT', cargoSignedAt: { lte: new Date(now.getTime() - REMINDER_DAYS[0] * 86_400_000) } },
    select: {
      id: true, contractNo: true, cargoId: true, guestEmail: true, accessToken: true, cargoSignedAt: true, fee: true,
      payToBank: true, payToAccount: true, warehouse: { select: { name: true } },
      events: { where: { action: 'PAYMENT_REMINDER' }, select: { id: true } },
    },
  })
  let reminded = 0
  for (const c of unpaid) {
    const sent = c.events.length
    if (sent >= REMINDER_DAYS.length) continue
    const ageDays = (now.getTime() - c.cargoSignedAt!.getTime()) / 86_400_000
    if (ageDays < REMINDER_DAYS[sent]) continue
    await addEvent(prisma, c.id, SYSTEM, 'PAYMENT_REMINDER', `${sent + 1}-р сануулга`)
    reminded++
    await notifyParty(c, `Сануулга: ${c.warehouse.name} агуулахтай гэрээний төлбөр`, [
      `Та "${c.warehouse.name}" агуулахтай ${c.contractNo} гэрээ байгуулах хүсэлт илгээсэн боловч төлбөр хараахан ороогүй байна.`,
      `Дүн: ${Number(c.fee).toLocaleString('en-US')}₮ · Данс: ${c.payToBank ?? ''} ${c.payToAccount ?? ''} · Гүйлгээний утга: ${c.contractNo}`,
      'Төлсний дараа гэрээний хуудаснаас "Төлбөр төлсөн" дарна уу. Төлбөр баталгаажмагц агуулах тантай холбогдоно.',
    ])
  }

  // Хөндөгдөөгүй зочны ноорог — и-мэйл оруулаад орхисон хүсэлтүүд
  const staleDrafts = await prisma.warehouseContract.deleteMany({
    where: { status: 'DRAFT', cargoId: null, updatedAt: { lte: new Date(now.getTime() - GUEST_DRAFT_DAYS * 86_400_000) } },
  })

  return NextResponse.json({ terminated, expired, reminded, guestDraftsDeleted: staleDrafts.count })
}

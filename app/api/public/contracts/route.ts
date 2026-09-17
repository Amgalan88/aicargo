import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { prisma } from '@/lib/prisma'
import { bad, readJson } from '@/lib/contract-auth'
import {
  WAREHOUSE_CONTRACT_SELECT, warehouseReadiness, getLatestTemplate, addEvent, contractNoFor,
  isUniqueViolation, newAccessToken, sendGuestLinks, clientIp,
} from '@/lib/contract-server'

const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! })
const byIp = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '15 m'), prefix: 'guest-contract-ip' })
const byEmail = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, '15 m'), prefix: 'guest-contract-email' })

const OPEN = ['DRAFT', 'AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'ACTIVE', 'TERMINATION_PENDING'] as const
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Нэвтрэлтгүй гэрээ эхлүүлэх: ноорог үүсгээд нууц холбоосыг зөвхөн и-мэйлээр илгээнэ (хариунд буцаахгүй) —
// ингэснээр холбоос нээсэн хүн тухайн и-мэйлийг эзэмшдэг нь батлагдана
export async function POST(req: NextRequest) {
  const body = await readJson<{ warehouseId?: number; email?: string; website?: string }>(req)
  if (!body) return bad('Invalid JSON')
  // Бот хамгаалалт: хүнд харагдахгүй талбар бөглөгдсөн бол амжилттай мэт хариулна
  if (body.website) return NextResponse.json({ ok: true })

  const email = body.email?.trim().toLowerCase() ?? ''
  if (!EMAIL_RE.test(email) || email.length > 120) return bad('И-мэйл хаяг буруу байна')
  const warehouseId = Number(body.warehouseId)
  if (!warehouseId) return bad('Агуулах сонгоно уу')

  const ip = clientIp(req.headers) ?? 'anonymous'
  const [a, b] = await Promise.all([byIp.limit(ip), byEmail.limit(email)])
  if (!a.success || !b.success) return bad('Хэт олон оролдлого. 15 минутын дараа дахин оролдоно уу', 429)

  const warehouse = await prisma.partnerWarehouse.findFirst({ where: { id: warehouseId, active: true }, select: WAREHOUSE_CONTRACT_SELECT })
  if (!warehouse) return bad('Агуулах олдсонгүй', 404)
  const template = await getLatestTemplate(prisma, warehouseId)
  if (!warehouse.acceptingContracts || !template || warehouseReadiness(warehouse, true).length) {
    return bad('Энэ агуулах одоогоор цахим гэрээ хүлээн авахгүй байна', 409)
  }

  const findOpen = () => prisma.warehouseContract.findFirst({
    where: { cargoId: null, guestEmail: email, warehouseId, status: { in: [...OPEN] } },
    select: { contractNo: true, status: true, accessToken: true },
  })

  let contract = await findOpen()
  if (!contract) {
    try {
      contract = await prisma.$transaction(async tx => {
        const token = newAccessToken()
        const created = await tx.warehouseContract.create({
          data: {
            contractNo: `TMP-${crypto.randomUUID()}`,
            warehouseId,
            guestEmail: email,
            accessToken: token,
            templateId: template.id,
            fee: warehouse.contractFee,
            values: JSON.stringify({ repPosition: 'Захирал', destination: 'Улаанбаатар хот' }),
          },
          select: { id: true, createdAt: true },
        })
        const contractNo = contractNoFor(created.id, created.createdAt)
        await tx.warehouseContract.update({ where: { id: created.id }, data: { contractNo } })
        await addEvent(tx, created.id, { id: null, name: email }, 'CREATED', 'Бүртгэлгүй хэрэглэгч')
        return { contractNo, status: 'DRAFT' as const, accessToken: token }
      })
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      contract = await findOpen()
    }
  }

  if (contract?.accessToken) {
    try {
      await sendGuestLinks(email, [{ warehouseName: warehouse.name, contractNo: contract.contractNo, status: contract.status, token: contract.accessToken }])
    } catch (err) {
      console.error('guest link email failed:', err)
      return bad('И-мэйл илгээж чадсангүй. Дахин оролдоно уу', 502)
    }
  }
  return NextResponse.json({ ok: true })
}

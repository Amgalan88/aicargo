import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest } from '@/lib/auth'
import { bad, readJson } from '@/lib/contract-auth'
import { DEMO_SLUG } from '@/lib/demo'
import { CargoValues, ContractBody, parseBody, renderBody, sanitizeValues, missingFields } from '@/lib/contract'
import {
  WAREHOUSE_CONTRACT_SELECT, ContractWarehouse, warehouseReadiness, getLatestTemplate, buildVars, hashBody,
  addEvent, notifySuper, appUrl, clientIp, requestOrigin, contractNoFor, newAccessToken, sendGuestLinks,
  isUniqueViolation,
} from '@/lib/contract-server'
import { sendContractOtpEmail } from '@/lib/mail'

// Агуулахтай гэрээ байгуулах хүсэлт — нэг богино маягт:
//   preview → бөглөсөн мэдээллээр гэрээний текст
//   code    → (бүртгэлгүй бол) и-мэйл рүү баталгаажуулах код — хог хүсэлтээс хамгаална
//   submit  → гэрээ шууд баталгаажиж "Төлбөр хүлээгдэж байна" төлөвт үүснэ (ноорог шатгүй)
// Нэвтэрсэн каргогийн эзэмшигч админд код шаардахгүй, гэрээ каргодоо холбогдоно.

const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! })
const codeByIp = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '15 m'), prefix: 'contract-code-ip' })
const codeByEmail = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, '15 m'), prefix: 'contract-code-email' })
const submitByIp = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '15 m'), prefix: 'contract-submit-ip' })

const LIVE_STATUSES = ['AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'ACTIVE', 'TERMINATION_PENDING'] as const
const OPEN_STATUSES = ['DRAFT', ...LIVE_STATUSES] as const
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

interface Body {
  step?: 'preview' | 'code' | 'submit'
  warehouseId?: number
  values?: unknown
  email?: string
  code?: string
  agree?: boolean
  website?: string // honeypot
}

type Owner = { kind: 'cargo'; cargoId: number; userId: number; name: string; email: string | null } | { kind: 'guest' }

async function ownerOf(req: NextRequest): Promise<Owner> {
  const user = await getVerifiedUserFromRequest(req)
  if (!user || user.role !== 'ADMIN' || !user.cargoId || user.isStaffAdmin) return { kind: 'guest' }
  const [cargo, me] = await Promise.all([
    prisma.cargo.findUnique({ where: { id: user.cargoId }, select: { slug: true } }),
    prisma.user.findUnique({ where: { id: user.userId }, select: { email: true } }),
  ])
  // Демо каргогийн нууц үг нийтэд ил — бодит гэрээ байгуулахгүй, зочноор үргэлжилнэ
  if (cargo?.slug === DEMO_SLUG) return { kind: 'guest' }
  return { kind: 'cargo', cargoId: user.cargoId, userId: user.userId, name: user.name, email: me?.email ?? null }
}

function render(tpl: { titleMn: string; titleCn: string; body: string }, wh: ContractWarehouse, contractNo: string, values: CargoValues, signDate?: Date): ContractBody {
  const payTo = { bank: wh.bankName, account: wh.bankAccount, holder: wh.bankHolder }
  return renderBody(
    { titleMn: tpl.titleMn, titleCn: tpl.titleCn, clauses: parseBody(tpl.body).clauses },
    buildVars({ contractNo, warehouse: wh, values, fee: wh.contractFee, signDate, payTo }),
  )
}

export async function POST(req: NextRequest) {
  const body = await readJson<Body>(req)
  if (!body) return bad('Invalid JSON')
  if (body.website) return NextResponse.json({ ok: true })

  const warehouseId = Number(body.warehouseId)
  const wh = warehouseId ? await prisma.partnerWarehouse.findFirst({ where: { id: warehouseId, active: true }, select: WAREHOUSE_CONTRACT_SELECT }) : null
  if (!wh) return bad('Агуулах олдсонгүй', 404)
  const template = await getLatestTemplate(prisma, wh.id)
  if (!template || !wh.acceptingContracts || warehouseReadiness(wh, true).length) {
    return bad('Энэ агуулах одоогоор цахим гэрээ хүлээн авахгүй байна', 409)
  }
  const values = sanitizeValues(body.values)

  if (body.step === 'preview') {
    return NextResponse.json({ body: render(template, wh, 'AC—', values) })
  }

  const missing = missingFields(values)
  if (missing.length) return bad(`Бөглөнө үү: ${missing.map(f => f.label).join(', ')}`)
  const owner = await ownerOf(req)
  const email = owner.kind === 'cargo' ? owner.email : body.email?.trim().toLowerCase() ?? ''
  if (owner.kind === 'guest' && !EMAIL_RE.test(email ?? '')) return bad('И-мэйл хаяг буруу байна')

  // ── Баталгаажуулах код (зөвхөн бүртгэлгүй) ──
  if (body.step === 'code') {
    if (owner.kind === 'cargo') return NextResponse.json({ ok: true, skip: true })
    const [a, b] = await Promise.all([codeByIp.limit(clientIp(req.headers) ?? 'anonymous'), codeByEmail.limit(email!)])
    if (!a.success || !b.success) return bad('Хэт олон оролдлого. 15 минутын дараа дахин оролдоно уу', 429)
    await prisma.otp.updateMany({ where: { email: email!, used: false }, data: { used: true } })
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    await prisma.otp.create({ data: { email: email!, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } })
    try {
      await sendContractOtpEmail(email!, code, wh.name)
    } catch {
      return bad('И-мэйл илгээхэд алдаа гарлаа. Хаягаа шалгаад дахин оролдоно уу', 500)
    }
    return NextResponse.json({ ok: true })
  }

  if (body.step !== 'submit') return bad('Үйлдэл буруу')
  if (body.agree !== true) return bad('Гэрээний нөхцөлийг зөвшөөрнө үү')
  const lim = await submitByIp.limit(clientIp(req.headers) ?? 'anonymous')
  if (!lim.success) return bad('Хэт олон оролдлого. 15 минутын дараа дахин оролдоно уу', 429)

  if (owner.kind === 'guest') {
    const otp = await prisma.otp.findFirst({
      where: { email: email!, code: String(body.code ?? '').trim(), used: false, expiresAt: { gt: new Date() } },
      orderBy: { id: 'desc' },
    })
    if (!otp) return bad('Код буруу эсвэл хугацаа дууссан байна')
    await prisma.otp.update({ where: { id: otp.id }, data: { used: true } })

    // Нэг и-мэйлээр нэг агуулахад давхар хүсэлт үүсгэхгүй — байгааг нь буцаана
    const existing = await prisma.warehouseContract.findFirst({
      where: { cargoId: null, guestEmail: email!, warehouseId: wh.id, status: { in: [...LIVE_STATUSES] } },
      select: { accessToken: true, contractNo: true, status: true },
    })
    if (existing?.accessToken) return NextResponse.json({ token: existing.accessToken, existing: true })
  } else {
    const existing = await prisma.warehouseContract.findFirst({
      where: { cargoId: owner.cargoId, warehouseId: wh.id, status: { in: [...LIVE_STATUSES] } },
      select: { id: true },
    })
    if (existing) return NextResponse.json({ id: existing.id, existing: true })
    // Хуучин урсгалаар эхэлсэн ноорог байвал цэвэрлээд шинээр баталгаажуулна
    await prisma.warehouseContract.deleteMany({ where: { cargoId: owner.cargoId, warehouseId: wh.id, status: 'DRAFT' } })
  }

  const now = new Date()
  const signerName = [values.repLastName, values.repFirstName].filter(Boolean).join(' ')
  const accessToken = owner.kind === 'guest' ? newAccessToken() : null
  const origin = requestOrigin(req)

  let created: { id: number; contractNo: string }
  try {
    created = await prisma.$transaction(async tx => {
      const c = await tx.warehouseContract.create({
        data: {
          contractNo: `TMP-${crypto.randomUUID()}`,
          warehouseId: wh.id,
          cargoId: owner.kind === 'cargo' ? owner.cargoId : null,
          guestEmail: owner.kind === 'guest' ? email : null,
          accessToken,
          templateId: template.id,
          fee: wh.contractFee,
          createdById: owner.kind === 'cargo' ? owner.userId : null,
          values: JSON.stringify(values),
        },
        select: { id: true, createdAt: true },
      })
      const contractNo = contractNoFor(c.id, c.createdAt)
      const renderedBody = JSON.stringify(render(template, wh, contractNo, values, now))
      await tx.warehouseContract.update({
        where: { id: c.id },
        data: {
          contractNo,
          status: 'AWAITING_PAYMENT',
          renderedBody,
          bodyHash: hashBody(renderedBody),
          payToBank: wh.bankName,
          payToAccount: wh.bankAccount,
          payToHolder: wh.bankHolder,
          cargoSignedAt: now,
          cargoSignerId: owner.kind === 'cargo' ? owner.userId : null,
          cargoSignerName: signerName,
          cargoSignerEmail: email || null,
          cargoSignIp: clientIp(req.headers),
        },
      })
      const actor = { id: owner.kind === 'cargo' ? owner.userId : null, name: signerName }
      await addEvent(tx, c.id, actor, 'CREATED', owner.kind === 'guest' ? 'Бүртгэлгүй хэрэглэгч' : null)
      const device = req.headers.get('user-agent')?.slice(0, 160)
      await addEvent(tx, c.id, actor, 'SIGNED', [signerName, email, device].filter(Boolean).join(' · '))
      return { id: c.id, contractNo }
    })
  } catch (err) {
    // Зэрэг хоёр хүсэлт — DB-ийн "нэг амьд гэрээ" индекс хамгаална
    if (owner.kind === 'cargo' && isUniqueViolation(err)) {
      const again = await prisma.warehouseContract.findFirst({
        where: { cargoId: owner.cargoId, warehouseId: wh.id, status: { in: [...OPEN_STATUSES] } },
        select: { id: true },
      })
      if (again) return NextResponse.json({ id: again.id, existing: true })
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) return bad('Хүсэлт хадгалахад алдаа гарлаа. Дахин оролдоно уу', 500)
    throw err
  }

  const who = values.cargoLegalName || signerName
  await notifySuper(`Шинэ гэрээний хүсэлт: ${created.contractNo}`, [
    `"${who}" "${wh.name}" агуулахтай гэрээ байгуулах хүсэлт илгээж, гэрээг цахимаар зөвшөөрлөө.`,
    `Холбоо барих: ${signerName} · ${values.repPhone}${email ? ' · ' + email : ''}`,
    'Төлбөр орсны дараа гэрээг баталгаажуулна уу.',
    appUrl(`/super/contracts/${created.id}`, origin),
  ])
  if (accessToken && email) {
    try {
      await sendGuestLinks(email, [{ warehouseName: wh.name, contractNo: created.contractNo, status: 'AWAITING_PAYMENT', token: accessToken }], origin)
    } catch (err) {
      console.error('contract link email failed:', err)
    }
  }
  return accessToken
    ? NextResponse.json({ token: accessToken }, { status: 201 })
    : NextResponse.json({ id: created.id }, { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { prisma } from '@/lib/prisma'
import { requireCargoAdmin, bad, readJson } from '@/lib/contract-auth'
import {
  CargoValues, ContractBody, parseBody, renderBody, sanitizeValues, missingFields,
  CARGO_FIELDS, TERMINATION_NOTICE_DAYS,
} from '@/lib/contract'
import {
  WAREHOUSE_CONTRACT_SELECT, ContractWarehouse, warehouseReadiness, getLatestTemplate, buildVars,
  hashBody, safeValues, addEvent, issueContractOtp, consumeContractOtp, notifySuper, appUrl, clientIp,
} from '@/lib/contract-server'
import { uploadPaymentProof } from '@/lib/cloudinary'

type Params = { params: Promise<{ id: string }> }

const otpLimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(3, '10 m'),
  prefix: 'contract-otp',
})

async function loadContract(id: number, cargoId: number) {
  if (!id) return null
  return prisma.warehouseContract.findFirst({
    where: { id, cargoId },
    include: {
      warehouse: { select: { ...WAREHOUSE_CONTRACT_SELECT, imageUrl: true } },
      template: { select: { titleMn: true, titleCn: true, body: true, version: true } },
      events: { orderBy: { createdAt: 'asc' }, select: { id: true, actorName: true, action: true, detail: true, createdAt: true } },
    },
  })
}

// Ноорог гэрээг хамгийн сүүлийн загвараар харуулна — гарын үсэг зурах үед мөн адил загвар хөлдөнө
function previewDraft(contractNo: string, wh: ContractWarehouse, values: CargoValues, template: { titleMn: string; titleCn: string; body: string }): ContractBody {
  const tpl: ContractBody = { titleMn: template.titleMn, titleCn: template.titleCn, clauses: parseBody(template.body).clauses }
  return renderBody(tpl, buildVars({ contractNo, warehouse: wh, values, fee: wh.contractFee }))
}

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireCargoAdmin(req, false)
  if (auth.error) return auth.error
  const c = await loadContract(Number((await params).id), auth.user.cargoId)
  if (!c) return bad('Гэрээ олдсонгүй', 404)

  const values = safeValues(c.values)
  let body: ContractBody
  let previewHash: string | null = null
  let warehouseReady = true
  if (c.status === 'DRAFT') {
    const latest = await getLatestTemplate(prisma, c.warehouseId)
    warehouseReady = !!latest && c.warehouse.active && c.warehouse.acceptingContracts && warehouseReadiness(c.warehouse, true).length === 0
    body = previewDraft(c.contractNo, c.warehouse, values, latest ?? c.template)
    previewHash = hashBody(JSON.stringify(body))
  } else {
    body = parseBody(c.renderedBody!)
  }

  const me = await prisma.user.findUnique({ where: { id: auth.user.userId }, select: { email: true, name: true } })
  const { warehouse: wh } = c
  return NextResponse.json({
    id: c.id,
    contractNo: c.contractNo,
    status: c.status,
    values,
    fields: CARGO_FIELDS,
    body,
    previewHash,
    bodyHash: c.bodyHash,
    // Гарын үсэг зурсны дараа хөлдөөсөн төлбөр, дансыг; өмнө нь одоогийн тохиргоог харуулна
    fee: c.status === 'DRAFT' ? wh.contractFee : c.fee,
    payTo: c.status === 'DRAFT'
      ? { bank: wh.bankName, account: wh.bankAccount, holder: wh.bankHolder }
      : { bank: c.payToBank, account: c.payToAccount, holder: c.payToHolder },
    paymentProofUrl: c.paymentProofUrl,
    paymentNote: c.paymentNote,
    paymentClaimedAt: c.paymentClaimedAt,
    paidAt: c.paidAt,
    cargoSignedAt: c.cargoSignedAt,
    cargoSignerName: c.cargoSignerName,
    approvedAt: c.approvedAt,
    approvedByName: c.approvedByName,
    warehouseNote: c.warehouseNote,
    rejectReason: c.rejectReason,
    terminationRequestedAt: c.terminationRequestedAt,
    terminationRequestedBy: c.terminationRequestedBy,
    terminationReason: c.terminationReason,
    terminationEffectiveAt: c.terminationEffectiveAt,
    terminatedAt: c.terminatedAt,
    createdAt: c.createdAt,
    events: c.events,
    warehouse: { id: wh.id, name: wh.name, slug: wh.slug, imageUrl: wh.imageUrl, legalNameMn: wh.legalNameMn, legalNameCn: wh.legalNameCn },
    warehouseReady,
    canManage: !auth.user.isStaffAdmin,
    me: { name: me?.name ?? '', email: me?.email ?? null },
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireCargoAdmin(req, true)
  if (auth.error) return auth.error
  const id = Number((await params).id)
  const body = await readJson<{ values?: unknown }>(req)
  if (!body) return bad('Invalid JSON')

  const values = sanitizeValues(body.values)
  const res = await prisma.warehouseContract.updateMany({
    where: { id, cargoId: auth.user.cargoId, status: 'DRAFT' },
    data: { values: JSON.stringify(values) },
  })
  if (res.count === 0) return bad('Зөвхөн ноорог гэрээг засах боломжтой', 409)
  return NextResponse.json({ ok: true, values })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireCargoAdmin(req, true)
  if (auth.error) return auth.error
  const id = Number((await params).id)
  const res = await prisma.warehouseContract.deleteMany({
    where: { id, cargoId: auth.user.cargoId, status: 'DRAFT' },
  })
  if (res.count === 0) return bad('Зөвхөн ноорог гэрээг устгах боломжтой', 409)
  return NextResponse.json({ ok: true })
}

interface ActionBody {
  action?: string
  code?: string
  signerName?: string
  agree?: boolean
  previewHash?: string
  proofBase64?: string
  note?: string
  reason?: string
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireCargoAdmin(req, true)
  if (auth.error) return auth.error
  const { user } = auth
  const actor = { id: user.userId, name: user.name }

  const body = await readJson<ActionBody>(req)
  if (!body) return bad('Invalid JSON')
  const c = await loadContract(Number((await params).id), user.cargoId)
  if (!c) return bad('Гэрээ олдсонгүй', 404)
  const values = safeValues(c.values)

  switch (body.action) {
    case 'send-otp': {
      if (c.status !== 'DRAFT') return bad('Гэрээ аль хэдийн баталгаажсан байна', 409)
      const missing = missingFields(values)
      if (missing.length) return bad(`Дутуу талбар: ${missing.map(f => f.label).join(', ')}`)
      const me = await prisma.user.findUnique({ where: { id: user.userId }, select: { email: true } })
      if (!me?.email) return bad('Таны бүртгэлд и-мэйл хаяг алга. Баталгаажуулах код илгээхийн тулд и-мэйлээ бүртгүүлнэ үү', 409)
      const { success } = await otpLimit.limit(`u${user.userId}`)
      if (!success) return bad('Хэт олон оролдлого. 10 минутын дараа дахин оролдоно уу', 429)
      await issueContractOtp(c.id, me.email, c.contractNo, c.warehouse.name)
      return NextResponse.json({ ok: true, email: maskEmail(me.email) })
    }

    case 'sign': {
      if (c.status !== 'DRAFT') return bad('Гэрээ аль хэдийн баталгаажсан байна', 409)
      if (body.agree !== true) return bad('Гэрээний нөхцөлийг зөвшөөрнө үү')
      const signerName = body.signerName?.replace(/\s+/g, ' ').trim() ?? ''
      if (signerName.length < 3) return bad('Бүтэн нэрээ бичнэ үү')
      if (!/^\d{6}$/.test(body.code ?? '')) return bad('6 оронтой код оруулна уу')
      const missing = missingFields(values)
      if (missing.length) return bad(`Дутуу талбар: ${missing.map(f => f.label).join(', ')}`)

      const latest = await getLatestTemplate(prisma, c.warehouseId)
      const wh = c.warehouse
      if (!latest || !wh.active || !wh.acceptingContracts || warehouseReadiness(wh, true).length) {
        return bad('Энэ агуулах одоогоор цахим гэрээ хүлээн авахгүй байна', 409)
      }
      // Хэрэглэгчийн уншсан текст яг энэ мөчийнхтэй ижил эсэх — загвар/тариф/данс хооронд нь өөрчлөгдсөн бол дахин уншуулна
      const preview = previewDraft(c.contractNo, wh, values, latest)
      if (hashBody(JSON.stringify(preview)) !== body.previewHash) {
        return bad('Гэрээний текст шинэчлэгдсэн байна. Дахин уншиж баталгаажуулна уу', 409)
      }

      const me = await prisma.user.findUnique({ where: { id: user.userId }, select: { email: true } })
      if (!me?.email) return bad('Таны бүртгэлд и-мэйл хаяг алга', 409)

      const now = new Date()
      const payTo = { bank: wh.bankName, account: wh.bankAccount, holder: wh.bankHolder }
      const frozen = renderBody(
        { titleMn: latest.titleMn, titleCn: latest.titleCn, clauses: parseBody(latest.body).clauses },
        buildVars({ contractNo: c.contractNo, warehouse: wh, values, fee: wh.contractFee, signDate: now, payTo }),
      )
      const renderedBody = JSON.stringify(frozen)

      const ok = await prisma.$transaction(async tx => {
        if (!await consumeContractOtp(tx, c.id, me.email!, body.code!)) return false
        const res = await tx.warehouseContract.updateMany({
          where: { id: c.id, status: 'DRAFT' },
          data: {
            status: 'AWAITING_PAYMENT',
            templateId: latest.id,
            renderedBody,
            bodyHash: hashBody(renderedBody),
            fee: wh.contractFee,
            payToBank: payTo.bank,
            payToAccount: payTo.account,
            payToHolder: payTo.holder,
            cargoSignedAt: now,
            cargoSignerId: user.userId,
            cargoSignerName: signerName,
            cargoSignerEmail: me.email,
            cargoSignIp: clientIp(req.headers),
          },
        })
        if (res.count !== 1) throw new Error('state changed')
        await addEvent(tx, c.id, actor, 'SIGNED', `${signerName} · ${me.email}`)
        return true
      })
      if (!ok) return bad('Код буруу эсвэл хугацаа дууссан байна')

      await notifySuper(`Шинэ гэрээ: ${c.contractNo}`, [
        `"${values.cargoLegalName}" карго "${wh.name}" агуулахтай ${c.contractNo} дугаартай гэрээг цахимаар баталгаажууллаа.`,
        'Төлбөр орсны дараа гэрээг баталгаажуулна уу.',
        appUrl(`/super/contracts/${c.id}`),
      ])
      return NextResponse.json({ ok: true })
    }

    case 'payment': {
      if (c.status !== 'AWAITING_PAYMENT') return bad('Энэ гэрээнд төлбөр мэдэгдэх боломжгүй', 409)
      const note = body.note?.trim().slice(0, 500) || null
      if (!body.proofBase64 && !note) return bad('Гүйлгээний баримтын зураг эсвэл тайлбар оруулна уу')
      let proofUrl: string | null = null
      if (body.proofBase64) {
        if (!body.proofBase64.startsWith('data:image/')) return bad('Баримт зураг байх ёстой')
        try {
          proofUrl = await uploadPaymentProof(body.proofBase64, c.id)
        } catch {
          return bad('Зураг байршуулахад алдаа гарлаа', 500)
        }
      }
      const res = await prisma.$transaction(async tx => {
        const r = await tx.warehouseContract.updateMany({
          where: { id: c.id, status: 'AWAITING_PAYMENT' },
          data: { status: 'PAYMENT_REVIEW', paymentProofUrl: proofUrl, paymentNote: note, paymentClaimedAt: new Date() },
        })
        if (r.count === 1) await addEvent(tx, c.id, actor, 'PAYMENT_CLAIMED', note)
        return r.count
      })
      if (!res) return bad('Гэрээний төлөв өөрчлөгдсөн байна', 409)
      await notifySuper(`Төлбөр шалгах: ${c.contractNo}`, [
        `"${values.cargoLegalName}" ${c.contractNo} гэрээний төлбөрөө төлсөн гэж мэдэгдлээ.`,
        `Данс: ${c.payToBank} ${c.payToAccount} · Дүн: ${Number(c.fee).toLocaleString('en-US')}₮`,
        appUrl(`/super/contracts/${c.id}`),
      ])
      return NextResponse.json({ ok: true })
    }

    case 'terminate': {
      if (c.status !== 'ACTIVE') return bad('Зөвхөн хүчинтэй гэрээг цуцлах боломжтой', 409)
      const reason = body.reason?.trim().slice(0, 1000) ?? ''
      if (reason.length < 3) return bad('Цуцлах шалтгаанаа бичнэ үү')
      const now = new Date()
      const effective = new Date(now.getTime() + TERMINATION_NOTICE_DAYS * 86_400_000)
      const res = await prisma.$transaction(async tx => {
        const r = await tx.warehouseContract.updateMany({
          where: { id: c.id, status: 'ACTIVE' },
          data: {
            status: 'TERMINATION_PENDING',
            terminationRequestedAt: now,
            terminationRequestedBy: 'CARGO',
            terminationReason: reason,
            terminationEffectiveAt: effective,
          },
        })
        if (r.count === 1) await addEvent(tx, c.id, actor, 'TERMINATION_REQUESTED', reason)
        return r.count
      })
      if (!res) return bad('Гэрээний төлөв өөрчлөгдсөн байна', 409)
      await notifySuper(`Гэрээ цуцлах мэдэгдэл: ${c.contractNo}`, [
        `"${values.cargoLegalName}" ${c.contractNo} гэрээг цуцлах мэдэгдэл өглөө. Шалтгаан: ${reason}`,
        appUrl(`/super/contracts/${c.id}`),
      ])
      return NextResponse.json({ ok: true })
    }

    case 'cancel-termination': {
      // Карго зөвхөн өөрийн өгсөн мэдэгдлийг буцаана
      const res = await prisma.$transaction(async tx => {
        const r = await tx.warehouseContract.updateMany({
          where: { id: c.id, status: 'TERMINATION_PENDING', terminationRequestedBy: 'CARGO' },
          data: {
            status: 'ACTIVE',
            terminationRequestedAt: null,
            terminationRequestedBy: null,
            terminationReason: null,
            terminationEffectiveAt: null,
          },
        })
        if (r.count === 1) await addEvent(tx, c.id, actor, 'TERMINATION_CANCELLED')
        return r.count
      })
      if (!res) return bad('Цуцлах мэдэгдлийг буцаах боломжгүй', 409)
      return NextResponse.json({ ok: true })
    }

    default:
      return bad('Үйлдэл буруу')
  }
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@')
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`
}

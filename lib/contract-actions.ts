// Гэрээний тал (Б тал)-ын үйлдлүүд — нэвтэрсэн каргогийн админ болон нууц холбоостой зочин хоёуланд ижил
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { bad, readJson } from '@/lib/contract-auth'
import {
  CargoValues, ContractBody, parseBody, renderBody, sanitizeValues, missingFields,
  CARGO_FIELDS, TERMINATION_NOTICE_DAYS,
} from '@/lib/contract'
import {
  WAREHOUSE_CONTRACT_SELECT, ContractWarehouse, warehouseReadiness, getLatestTemplate, buildVars,
  hashBody, safeValues, addEvent, notifySuper, appUrl, clientIp, requestOrigin,
} from '@/lib/contract-server'
import { uploadPaymentProof } from '@/lib/cloudinary'

// Хэн хандаж байгаа: where нь эрхийн нөхцөл (cargoId эсвэл accessToken), email нь баталгаажуулах код очих хаяг
export interface PartyAccess {
  where: Prisma.WarehouseContractWhereInput
  actor: { id: number | null; name: string }
  canManage: boolean
  email: string | null
  signerName: string
  guest: boolean
}

async function loadContract(where: Prisma.WarehouseContractWhereInput) {
  return prisma.warehouseContract.findFirst({
    where,
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

export async function getContractView(access: PartyAccess) {
  const c = await loadContract(access.where)
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
    canManage: access.canManage,
    guest: access.guest,
    me: { name: access.signerName, email: access.email },
  })
}

export async function patchValues(req: NextRequest, access: PartyAccess) {
  const body = await readJson<{ values?: unknown }>(req)
  if (!body) return bad('Invalid JSON')
  const values = sanitizeValues(body.values)
  const res = await prisma.warehouseContract.updateMany({
    where: { AND: [access.where, { status: 'DRAFT' }] },
    data: { values: JSON.stringify(values) },
  })
  if (res.count === 0) return bad('Зөвхөн ноорог гэрээг засах боломжтой', 409)
  return NextResponse.json({ ok: true, values })
}

export async function deleteDraft(access: PartyAccess) {
  const res = await prisma.warehouseContract.deleteMany({ where: { AND: [access.where, { status: 'DRAFT' }] } })
  if (res.count === 0) return bad('Зөвхөн ноорог гэрээг устгах боломжтой', 409)
  return NextResponse.json({ ok: true })
}

interface ActionBody {
  action?: string
  signerName?: string
  agree?: boolean
  previewHash?: string
  proofBase64?: string
  note?: string
  reason?: string
}

export async function partyAction(req: NextRequest, access: PartyAccess) {
  const { actor } = access
  const origin = requestOrigin(req)
  const body = await readJson<ActionBody>(req)
  if (!body) return bad('Invalid JSON')
  const c = await loadContract(access.where)
  if (!c) return bad('Гэрээ олдсонгүй', 404)
  const values = safeValues(c.values)
  const who = access.guest ? `${values.cargoLegalName || access.email} (бүртгэлгүй)` : `"${values.cargoLegalName}" карго`

  switch (body.action) {
    case 'sign': {
      if (c.status !== 'DRAFT') return bad('Гэрээ аль хэдийн баталгаажсан байна', 409)
      if (body.agree !== true) return bad('Гэрээний нөхцөлийг зөвшөөрнө үү')
      const signerName = body.signerName?.replace(/\s+/g, ' ').trim() ?? ''
      if (signerName.length < 3) return bad('Бүтэн нэрээ бичнэ үү')
      const missing = missingFields(values)
      if (missing.length) return bad(`Дутуу талбар: ${missing.map(f => f.label).join(', ')}`)
      const email = access.email

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

      const now = new Date()
      const payTo = { bank: wh.bankName, account: wh.bankAccount, holder: wh.bankHolder }
      const frozen = renderBody(
        { titleMn: latest.titleMn, titleCn: latest.titleCn, clauses: parseBody(latest.body).clauses },
        buildVars({ contractNo: c.contractNo, warehouse: wh, values, fee: wh.contractFee, signDate: now, payTo }),
      )
      const renderedBody = JSON.stringify(frozen)

      try {
      await prisma.$transaction(async tx => {
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
            cargoSignerId: actor.id,
            cargoSignerName: signerName,
            cargoSignerEmail: email,
            cargoSignIp: clientIp(req.headers),
          },
        })
        if (res.count !== 1) throw new Error('STATE_CHANGED')
        // Вэб дээр баталгаажуулсан нотолгоо: нэр, и-мэйл, IP, төхөөрөмж
        const device = req.headers.get('user-agent')?.slice(0, 160)
        await addEvent(tx, c.id, { id: actor.id, name: access.guest ? signerName : actor.name }, 'SIGNED',
          [signerName, email, device].filter(Boolean).join(' · '))
      })
      } catch (err) {
        if (err instanceof Error && err.message === 'STATE_CHANGED') return bad('Гэрээ аль хэдийн баталгаажсан байна', 409)
        throw err
      }

      await notifySuper(`Шинэ гэрээ: ${c.contractNo}`, [
        `${who} "${wh.name}" агуулахтай ${c.contractNo} дугаартай гэрээг цахимаар баталгаажууллаа.`,
        'Төлбөр орсны дараа гэрээг баталгаажуулна уу.',
        appUrl(`/super/contracts/${c.id}`, origin),
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
      const partyActor = { id: actor.id, name: access.guest ? c.cargoSignerName ?? actor.name : actor.name }
      const res = await prisma.$transaction(async tx => {
        const r = await tx.warehouseContract.updateMany({
          where: { id: c.id, status: 'AWAITING_PAYMENT' },
          data: { status: 'PAYMENT_REVIEW', paymentProofUrl: proofUrl, paymentNote: note, paymentClaimedAt: new Date() },
        })
        if (r.count === 1) await addEvent(tx, c.id, partyActor, 'PAYMENT_CLAIMED', note)
        return r.count
      })
      if (!res) return bad('Гэрээний төлөв өөрчлөгдсөн байна', 409)
      await notifySuper(`Төлбөр шалгах: ${c.contractNo}`, [
        `${who} ${c.contractNo} гэрээний төлбөрөө төлсөн гэж мэдэгдлээ.`,
        `Данс: ${c.payToBank} ${c.payToAccount} · Дүн: ${Number(c.fee).toLocaleString('en-US')}₮`,
        appUrl(`/super/contracts/${c.id}`, origin),
      ])
      return NextResponse.json({ ok: true })
    }

    case 'terminate': {
      if (c.status !== 'ACTIVE') return bad('Зөвхөн хүчинтэй гэрээг цуцлах боломжтой', 409)
      const reason = body.reason?.trim().slice(0, 1000) ?? ''
      if (reason.length < 3) return bad('Цуцлах шалтгаанаа бичнэ үү')
      const now = new Date()
      const effective = new Date(now.getTime() + TERMINATION_NOTICE_DAYS * 86_400_000)
      const partyActor = { id: actor.id, name: access.guest ? c.cargoSignerName ?? actor.name : actor.name }
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
        if (r.count === 1) await addEvent(tx, c.id, partyActor, 'TERMINATION_REQUESTED', reason)
        return r.count
      })
      if (!res) return bad('Гэрээний төлөв өөрчлөгдсөн байна', 409)
      await notifySuper(`Гэрээ цуцлах мэдэгдэл: ${c.contractNo}`, [
        `${who} ${c.contractNo} гэрээг цуцлах мэдэгдэл өглөө. Шалтгаан: ${reason}`,
        appUrl(`/super/contracts/${c.id}`, origin),
      ])
      return NextResponse.json({ ok: true })
    }

    case 'cancel-termination': {
      // Б тал зөвхөн өөрийн өгсөн мэдэгдлийг буцаана
      const partyActor = { id: actor.id, name: access.guest ? c.cargoSignerName ?? actor.name : actor.name }
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
        if (r.count === 1) await addEvent(tx, c.id, partyActor, 'TERMINATION_CANCELLED')
        return r.count
      })
      if (!res) return bad('Цуцлах мэдэгдлийг буцаах боломжгүй', 409)
      return NextResponse.json({ ok: true })
    }

    default:
      return bad('Үйлдэл буруу')
  }
}

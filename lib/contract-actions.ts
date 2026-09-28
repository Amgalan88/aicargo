// Гэрээний тал (Б тал)-ын үйлдлүүд — гэрээний нууц холбоосоор (хүн бүрт ижил), каргогийн админд зөвхөн харах
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { bad, readJson } from '@/lib/contract-auth'
import { TERMINATION_NOTICE_DAYS, receiveAddressFor } from '@/lib/contract'
import {
  WAREHOUSE_CONTRACT_SELECT, contractBodyFor, safeValues, addEvent, notifySuper, appUrl, requestOrigin,
} from '@/lib/contract-server'
import { uploadPaymentProof } from '@/lib/cloudinary'

// Хэн хандаж байгаа: where нь эрхийн нөхцөл (cargoId эсвэл accessToken), email нь баталгаажуулах код очих хаяг
export interface PartyAccess {
  where: Prisma.WarehouseContractWhereInput
  actor: { id: number | null; name: string }
  canManage: boolean
  email: string | null
  signerName: string
  // Гэрээний нууц холбоосоор нээсэн эсэх (эсрэгээрээ — каргогийн админ хэсгээс)
  viaLink: boolean
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

export async function getContractView(access: PartyAccess) {
  const c = await loadContract(access.where)
  if (!c) return bad('Гэрээ олдсонгүй', 404)

  const values = safeValues(c.values)
  const body = contractBodyFor(c)

  const { warehouse: wh } = c
  // Хүчинтэй гэрээнд агуулахын хаяг + тэмдэг; вэбсайтад аль хэдийн тохируулсан эсэх
  const live = c.status === 'ACTIVE' || c.status === 'TERMINATION_PENDING'
  const receiveAddress = live ? receiveAddressFor(wh, c.cargoMark) : null
  let addressApplied = false
  if (receiveAddress && c.cargoId) {
    const cargo = await prisma.cargo.findUnique({ where: { id: c.cargoId }, select: { ereemReceiver: true, ereemPhone: true, ereemRegion: true, ereemAddress: true } })
    addressApplied = !!cargo && cargo.ereemReceiver === receiveAddress.receiver && cargo.ereemPhone === receiveAddress.phone
      && cargo.ereemRegion === receiveAddress.region && cargo.ereemAddress === receiveAddress.address
  }
  return NextResponse.json({
    id: c.id,
    contractNo: c.contractNo,
    status: c.status,
    values,
    body,
    bodyHash: c.bodyHash,
    // Гэрээ үүсэх үед хөлдөөсөн төлбөр, данс
    fee: c.fee,
    payTo: { bank: c.payToBank, account: c.payToAccount, holder: c.payToHolder },
    paymentProofUrl: c.paymentProofUrl,
    paymentNote: c.paymentNote,
    paymentClaimedAt: c.paymentClaimedAt,
    paidAt: c.paidAt,
    cargoSignedAt: c.cargoSignedAt,
    cargoSignerName: c.cargoSignerName,
    approvedAt: c.approvedAt,
    approvedByName: c.approvedByName,
    warehouseNote: c.warehouseNote,
    cargoMark: live ? c.cargoMark : null,
    receiveAddress,
    addressApplied,
    rejectReason: c.rejectReason,
    terminationRequestedAt: c.terminationRequestedAt,
    terminationRequestedBy: c.terminationRequestedBy,
    terminationReason: c.terminationReason,
    terminationEffectiveAt: c.terminationEffectiveAt,
    terminatedAt: c.terminatedAt,
    createdAt: c.createdAt,
    events: c.events,
    warehouse: {
      id: wh.id, name: wh.name, slug: wh.slug, imageUrl: wh.imageUrl, legalNameMn: wh.legalNameMn, legalNameCn: wh.legalNameCn,
      // Хаяг, тэмдгийг талууд чатаар тохирно — холбоо барих мэдээллийг зөвхөн төлбөр баталгаажсаны дараа
      ...(live ? { phone: wh.phone, wechat: wh.wechat } : {}),
    },
    canManage: access.canManage,
    viaLink: access.viaLink,
    cargoLinked: !!c.cargoId,
    me: { name: access.signerName, email: access.email },
  })
}

interface ActionBody {
  action?: string
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
  const who = [values.repLastName, values.repFirstName].filter(Boolean).join(' ') || c.cargoSignerName || access.email || 'Б тал'
  // Үйлдэл хийсэн хүн — гэрээ байгуулсан хүний нэрээр
  const partyActor = { id: actor.id, name: c.cargoSignerName ?? actor.name }

  switch (body.action) {
    case 'payment': {
      if (c.status !== 'AWAITING_PAYMENT') return bad('Энэ гэрээнд төлбөр мэдэгдэх боломжгүй', 409)
      // Баримт, тайлбар заавал биш — super admin дансаа шалгана
      const note = body.note?.trim().slice(0, 500) || null
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
        if (r.count === 1) await addEvent(tx, c.id, partyActor, 'PAYMENT_CLAIMED', note)
        return r.count
      })
      if (!res) return bad('Гэрээний төлөв өөрчлөгдсөн байна', 409)
      await notifySuper(`Төлбөр шалгах: ${c.contractNo}`, [
        `${who} ${c.contractNo} гэрээний төлбөрөө төлсөн гэж мэдэгдлээ.`,
        `Холбоо барих: ${[c.cargoSignerName, values.repPhone, c.cargoSignerEmail].filter(Boolean).join(' · ')}`,
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

    case 'use-address': {
      // Гэрээгээр авсан хаягийг каргогийн вэбсайтын "Эрээний хаяг"-т тохируулна (хуучин хаягийг дарж бичнэ)
      if (!c.cargoId || !access.canManage) return bad('Эрх хүрэхгүй', 403)
      if (c.status !== 'ACTIVE' && c.status !== 'TERMINATION_PENDING') return bad('Зөвхөн хүчинтэй гэрээний хаягийг ашиглана', 409)
      const addr = receiveAddressFor(c.warehouse, c.cargoMark)
      if (!addr) return bad('Агуулах танд хаяг олгоогүй байна', 409)
      await prisma.$transaction(async tx => {
        await tx.cargo.update({
          where: { id: c.cargoId! },
          data: { ereemReceiver: addr.receiver, ereemPhone: addr.phone, ereemRegion: addr.region, ereemAddress: addr.address },
        })
        await addEvent(tx, c.id, partyActor, 'ADDRESS_APPLIED', `${addr.region} ${addr.address}`)
      })
      return NextResponse.json({ ok: true })
    }

    default:
      return bad('Үйлдэл буруу')
  }
}

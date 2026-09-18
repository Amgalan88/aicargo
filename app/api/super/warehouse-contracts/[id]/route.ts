import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin, bad, readJson } from '@/lib/contract-auth'
import { parseBody, CARGO_FIELDS, TERMINATION_NOTICE_DAYS, WEBSITE_BONUS_DAYS, formatDateTime, ContractStatus, normalizeMark, receiveAddressFor } from '@/lib/contract'
import { safeValues, addEvent, notifyParty, contractBodyFor, requestOrigin, grantWebsiteBonus, appUrl, isUniqueViolation, WAREHOUSE_CONTRACT_SELECT } from '@/lib/contract-server'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireSuperAdmin(req)
  if (auth.error) return auth.error
  const id = Number((await params).id)
  const c = id ? await prisma.warehouseContract.findUnique({
    where: { id },
    include: {
      cargo: { select: { id: true, name: true, slug: true } },
      warehouse: { select: WAREHOUSE_CONTRACT_SELECT },
      template: { select: { titleMn: true, titleCn: true, body: true, version: true } },
      events: { orderBy: { createdAt: 'asc' }, select: { id: true, actorName: true, action: true, detail: true, createdAt: true } },
    },
  }) : null
  if (!c) return bad('Гэрээ олдсонгүй', 404)

  const { template, warehouse, values, renderedBody, accessToken: _token, ...rest } = c
  return NextResponse.json({
    ...rest,
    values: safeValues(values),
    fields: CARGO_FIELDS,
    body: renderedBody ? parseBody(renderedBody) : contractBodyFor(c),
    templateVersion: template.version,
    warehouse: { id: warehouse.id, name: warehouse.name, legalNameMn: warehouse.legalNameMn },
    // Тэмдэг олгохоос өмнө агуулахын хүлээн авах хаяг бөглөгдсөн эсэх, санал болгох тэмдэг
    receiveReady: !!(warehouse.receiveAddress && warehouse.receivePhone),
    receiveAddress: receiveAddressFor(warehouse, c.cargoMark),
    suggestedMark: c.cargoMark ?? normalizeMark(c.cargo?.slug.replace(/[^a-z0-9]/gi, '').slice(0, 12)),
  })
}

interface ActionBody {
  action?: string
  reason?: string
  note?: string
  paidConfirmed?: boolean
  immediate?: boolean
  cargoMark?: string
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireSuperAdmin(req)
  if (auth.error) return auth.error
  const actor = { id: auth.user.userId, name: auth.user.name }
  const id = Number((await params).id)
  const body = await readJson<ActionBody>(req)
  if (!body) return bad('Invalid JSON')

  const c = id ? await prisma.warehouseContract.findUnique({
    where: { id },
    select: {
      id: true, contractNo: true, status: true, cargoId: true, guestEmail: true, accessToken: true, warehouseId: true,
      warehouse: { select: { name: true, receiveRegion: true, receiveAddress: true, receivePhone: true } },
    },
  }) : null
  if (!c) return bad('Гэрээ олдсонгүй', 404)
  const now = new Date()
  const origin = requestOrigin(req)

  // Төлөв зөвхөн заасан төлвүүдээс шилжинэ — зэрэг хоёр үйлдэл давхцахаас хамгаална
  const transition = (from: ContractStatus[], data: Prisma.WarehouseContractUpdateManyMutationInput, action: string, detail?: string | null) =>
    prisma.$transaction(async tx => {
      const r = await tx.warehouseContract.updateMany({ where: { id: c.id, status: { in: from } }, data })
      if (r.count === 1) await addEvent(tx, c.id, actor, action, detail)
      return r.count === 1
    })

  // Тэмдэг хоосон бол null; бичсэн боловч буруу бол алдаа
  const markInput = body.cargoMark?.trim() ? normalizeMark(body.cargoMark) : null
  if (body.cargoMark?.trim() && !markInput) return bad('Тэмдэг зөвхөн латин үсэг, тоо, зураас (16 хүртэл тэмдэгт) байна')
  // Нэг агуулахын хүчинтэй гэрээнүүдэд тэмдэг давхцахгүй — DB-ийн partial unique index мөн хамгаална
  const markTaken = async (mark: string) => !!(await prisma.warehouseContract.findFirst({
    where: { warehouseId: c.warehouseId, id: { not: c.id }, status: { in: ['ACTIVE', 'TERMINATION_PENDING'] }, cargoMark: { equals: mark, mode: 'insensitive' } },
    select: { id: true },
  }))
  const MARK_TAKEN = 'Энэ тэмдэг энэ агуулахад өөр каргод олгогдсон байна'

  switch (body.action) {
    case 'approve': {
      if (body.paidConfirmed !== true) return bad('Төлбөр агуулахын дансанд орсныг баталгаажуулна уу')
      const note = body.note?.trim().slice(0, 1000) || null
      if (markInput && await markTaken(markInput)) return bad(MARK_TAKEN, 409)
      let ok: boolean
      try {
        ok = await transition(['AWAITING_PAYMENT', 'PAYMENT_REVIEW'], {
          status: 'ACTIVE', paidAt: now, approvedAt: now, approvedById: actor.id, approvedByName: actor.name,
          warehouseNote: note, cargoMark: markInput,
        }, 'APPROVED', [note, markInput && `Тэмдэг: ${markInput}`].filter(Boolean).join(' · ') || null)
      } catch (err) {
        if (isUniqueViolation(err)) return bad(MARK_TAKEN, 409)
        throw err
      }
      if (!ok) return bad('Энэ гэрээг батлах боломжгүй төлөвт байна', 409)
      const addr = receiveAddressFor(c.warehouse, markInput)
      // Гэрээтэй карго вэбсайтаа 60 хоног үнэгүй ашиглана; бүртгэлгүй бол карго нээх үед олгоно
      const cargoId = c.cargoId
      const bonusUntil = cargoId ? await prisma.$transaction(tx => grantWebsiteBonus(tx, c.id, cargoId, actor)) : null
      await notifyParty(c, `Гэрээ ${c.contractNo} хүчин төгөлдөр боллоо`, [
        `"${c.warehouse.name}" агуулахтай байгуулсан ${c.contractNo} гэрээний төлбөр баталгаажиж, гэрээ хүчин төгөлдөр боллоо.`,
        ...(note ? [`Агуулахын тэмдэглэл: ${note}`] : []),
        ...(addr ? [
          'Таны Эрээнд ачаа хүлээн авах хаяг:',
          `收货人: ${addr.receiver} · 手机号: ${addr.phone}`,
          `地区: ${addr.region} · 详细地址: ${addr.address}`,
          ...(c.cargoId ? ['Админ хэсгийн "Агуулах" цэснээс нэг товчоор вэбсайтдаа тохируулна уу.'] : []),
        ] : []),
        ...(bonusUntil ? [`Бэлэг: таны aicargo вэбсайтын эрх ${WEBSITE_BONUS_DAYS} хоногоор сунгагдаж ${formatDateTime(bonusUntil).slice(0, 10)} хүртэл боллоо.`] : []),
        ...(!c.cargoId && c.accessToken ? [
          `Бэлэг: өөрийн каргогийн вэбсайтыг нээж ${WEBSITE_BONUS_DAYS} хоног үнэгүй ашиглаарай:`,
          appUrl(`/signup-cargo?contract=${c.accessToken}`, origin),
        ] : []),
        'Гэрээний PDF хувийг доорх холбоосоор татаж авна уу.',
      ], origin)
      return NextResponse.json({ ok: true })
    }

    case 'reject': {
      const reason = body.reason?.trim().slice(0, 1000) ?? ''
      if (reason.length < 3) return bad('Татгалзах шалтгаан бичнэ үү')
      const ok = await transition(['AWAITING_PAYMENT', 'PAYMENT_REVIEW'], { status: 'REJECTED', rejectReason: reason }, 'REJECTED', reason)
      if (!ok) return bad('Энэ гэрээнээс татгалзах боломжгүй төлөвт байна', 409)
      await notifyParty(c, `Гэрээ ${c.contractNo} татгалзагдлаа`, [
        `"${c.warehouse.name}" агуулахтай байгуулах ${c.contractNo} гэрээ татгалзагдлаа.`,
        `Шалтгаан: ${reason}`,
      ], origin)
      return NextResponse.json({ ok: true })
    }

    case 'terminate': {
      const reason = body.reason?.trim().slice(0, 1000) ?? ''
      if (reason.length < 3) return bad('Цуцлах шалтгаан бичнэ үү')
      if (body.immediate) {
        const ok = await transition(['ACTIVE', 'TERMINATION_PENDING'], {
          status: 'TERMINATED',
          terminatedAt: now,
          ...(c.status === 'ACTIVE'
            ? { terminationRequestedAt: now, terminationRequestedBy: 'SUPER', terminationReason: reason, terminationEffectiveAt: now }
            : {}),
        }, 'TERMINATED', reason)
        if (!ok) return bad('Энэ гэрээг цуцлах боломжгүй төлөвт байна', 409)
        await notifyParty(c, `Гэрээ ${c.contractNo} цуцлагдлаа`, [
          `"${c.warehouse.name}" агуулахтай байгуулсан ${c.contractNo} гэрээ цуцлагдлаа.`,
          `Шалтгаан: ${reason}`,
          'Гэрээний төлбөр буцаагдахгүй (гэрээний 2.8, 6.4-р заалт).',
        ], origin)
        return NextResponse.json({ ok: true })
      }
      const effective = new Date(now.getTime() + TERMINATION_NOTICE_DAYS * 86_400_000)
      const ok = await transition(['ACTIVE'], {
        status: 'TERMINATION_PENDING', terminationRequestedAt: now, terminationRequestedBy: 'SUPER',
        terminationReason: reason, terminationEffectiveAt: effective,
      }, 'TERMINATION_REQUESTED', reason)
      if (!ok) return bad('Зөвхөн хүчинтэй гэрээг цуцлах боломжтой', 409)
      await notifyParty(c, `Гэрээ ${c.contractNo} цуцлах мэдэгдэл`, [
        `"${c.warehouse.name}" агуулах ${c.contractNo} гэрээг ${TERMINATION_NOTICE_DAYS} хоногийн дараа (${formatDateTime(effective).slice(0, 10)}) цуцлах мэдэгдэл өглөө.`,
        `Шалтгаан: ${reason}`,
      ], origin)
      return NextResponse.json({ ok: true })
    }

    case 'cancel-termination': {
      const ok = await transition(['TERMINATION_PENDING'], {
        status: 'ACTIVE', terminationRequestedAt: null, terminationRequestedBy: null,
        terminationReason: null, terminationEffectiveAt: null,
      }, 'TERMINATION_CANCELLED')
      if (!ok) return bad('Цуцлагдаж буй гэрээ биш байна', 409)
      await notifyParty(c, `Гэрээ ${c.contractNo} цуцлалт буцаагдлаа`, [
        `${c.contractNo} гэрээг цуцлах мэдэгдэл буцаагдаж, гэрээ хүчинтэй хэвээр байна.`,
      ], origin)
      return NextResponse.json({ ok: true })
    }

    case 'mark': {
      if (!markInput) return bad('Тэмдэг оруулна уу')
      if (await markTaken(markInput)) return bad(MARK_TAKEN, 409)
      try {
        const ok = await transition(['ACTIVE', 'TERMINATION_PENDING'], { cargoMark: markInput }, 'MARK_SET', markInput)
        if (!ok) return bad('Зөвхөн хүчинтэй гэрээнд тэмдэг олгоно', 409)
      } catch (err) {
        if (isUniqueViolation(err)) return bad(MARK_TAKEN, 409)
        throw err
      }
      return NextResponse.json({ ok: true })
    }

    case 'note': {
      const note = body.note?.trim().slice(0, 1000) || null
      const r = await prisma.warehouseContract.updateMany({
        where: { id: c.id, status: { in: ['ACTIVE', 'TERMINATION_PENDING'] } },
        data: { warehouseNote: note },
      })
      if (!r.count) return bad('Зөвхөн хүчинтэй гэрээнд тэмдэглэл хөтөлнө', 409)
      return NextResponse.json({ ok: true })
    }

    default:
      return bad('Үйлдэл буруу')
  }
}

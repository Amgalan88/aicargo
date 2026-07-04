import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden, JwtPayload } from '@/lib/auth'

// Багц бүртгэл: EREEN ажилтан болон ADMIN хоёулаа хандана.
// Карго нь batchEnabled байх ёстой.
async function requireBatchAccess(req: NextRequest): Promise<{ user?: JwtPayload & { name: string }; error?: NextResponse }> {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return { error: unauthorized() }
  if (user.role !== 'EREEN' && user.role !== 'ADMIN') return { error: forbidden() }
  if (!user.cargoId) return { error: forbidden() }
  const cargo = await (prisma.cargo as any).findUnique({
    where: { id: user.cargoId },
    select: { batchEnabled: true },
  })
  if (!cargo?.batchEnabled) {
    return { error: NextResponse.json({ error: 'Багц бүртгэл энэ каргод идэвхжээгүй байна' }, { status: 403 }) }
  }
  const rec = await prisma.user.findUnique({ where: { id: user.userId }, select: { name: true } })
  return { user: { ...user, name: rec?.name ?? '' } }
}

// Track кодод шаардлага тавихгүй — хоосон биш л бол болно (тоогоор дугаарлаж ч болно)
function normCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const codes = raw
    .map(c => String(c).trim().toUpperCase())
    .filter(c => c.length > 0)
  return Array.from(new Set(codes))
}

export async function GET(req: NextRequest) {
  const auth = await requireBatchAccess(req)
  if (auth.error) return auth.error

  const phone = req.nextUrl.searchParams.get('phone')?.trim()
  const status = req.nextUrl.searchParams.get('status')?.trim()

  const batches = await (prisma as any).batch.findMany({
    where: {
      cargoId: auth.user!.cargoId,
      ...(phone ? { phone: { contains: phone } } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { id: 'desc' },
    take: 100,
    include: {
      shipments: { select: { id: true, trackCode: true } },
      logs: { orderBy: { id: 'desc' }, take: 20 },
    },
  })
  return NextResponse.json(batches)
}

export async function POST(req: NextRequest) {
  const auth = await requireBatchAccess(req)
  if (auth.error) return auth.error
  const user = auth.user!
  const cargoId = user.cargoId!

  const body = await req.json()
  const codes = normCodes(body.codes)
  const phone = String(body.phone ?? '').trim()
  const price = Number(body.price)
  // Багц feature = юань тооцоотой карго: үнэ үргэлж CNY
  const currency = 'CNY'

  if (codes.length === 0) return NextResponse.json({ error: 'Трак код оруулна уу' }, { status: 400 })
  if (!/^\d{8}$/.test(phone)) return NextResponse.json({ error: 'Утасны дугаар 8 оронтой байна' }, { status: 400 })
  if (!isFinite(price) || price < 0) return NextResponse.json({ error: 'Үнэ буруу байна' }, { status: 400 })

  // Утсаар хэрэглэгч холбоно
  const owner = await prisma.user.findFirst({ where: { phone, cargoId }, select: { id: true } })

  const batch = await prisma.$transaction(async tx => {
    // Эрээнээс ачигдсан багц ИРСЭН статустай бүртгэгдэнэ
    const b = await (tx as any).batch.create({
      data: { cargoId, phone, userId: owner?.id ?? null, price, currency, status: 'ARRIVED' },
    })
    const now = new Date()
    for (const code of codes) {
      // Өмнө нь бүртгэгдсэн ачаа автоматаар багцад шингэнэ (эзэн нь хадгалагдана)
      await tx.shipment.upsert({
        where: { trackCode_cargoId: { trackCode: code, cargoId } },
        update: {
          status: 'ARRIVED',
          arrivedAt: now,
          batchId: b.id,
          phone,
          ...(owner ? { userId: owner.id } : {}),
        } as any,
        create: {
          trackCode: code,
          status: 'ARRIVED',
          arrivedAt: now,
          batchId: b.id,
          phone,
          cargoId,
          ...(owner ? { userId: owner.id } : {}),
        } as any,
      })
    }
    await (tx as any).batchLog.create({
      data: {
        batchId: b.id,
        userId: user.userId,
        userName: user.name,
        action: 'created',
        detail: `${codes.length} код · ${phone} · ${price} ${currency}`,
      },
    })
    return b
  })

  return NextResponse.json({ ok: true, id: batch.id }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireBatchAccess(req)
  if (auth.error) return auth.error
  const user = auth.user!
  const cargoId = user.cargoId!

  const body = await req.json()
  const id = Number(body.id)
  if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })

  const batch = await (prisma as any).batch.findFirst({
    where: { id, cargoId },
    include: { shipments: { select: { id: true, trackCode: true } } },
  })
  if (!batch) return NextResponse.json({ error: 'Багц олдсонгүй' }, { status: 404 })

  const changes: string[] = []
  const data: any = {}

  if (body.phone !== undefined) {
    const phone = String(body.phone).trim()
    if (!/^\d{8}$/.test(phone)) return NextResponse.json({ error: 'Утасны дугаар 8 оронтой байна' }, { status: 400 })
    if (phone !== batch.phone) {
      const owner = await prisma.user.findFirst({ where: { phone, cargoId }, select: { id: true } })
      data.phone = phone
      data.userId = owner?.id ?? null
      changes.push(`утас: ${batch.phone} → ${phone}`)
    }
  }
  if (body.price !== undefined) {
    const price = Number(body.price)
    if (!isFinite(price) || price < 0) return NextResponse.json({ error: 'Үнэ буруу байна' }, { status: 400 })
    if (price !== Number(batch.price)) {
      data.price = price
      changes.push(`үнэ: ${batch.price} → ${price}`)
    }
  }
  if (body.currency !== undefined) {
    const currency = body.currency === 'CNY' ? 'CNY' : 'MNT'
    if (currency !== batch.currency) {
      data.currency = currency
      changes.push(`валют: ${batch.currency} → ${currency}`)
    }
  }

  await prisma.$transaction(async tx => {
    if (Object.keys(data).length > 0) {
      await (tx as any).batch.update({ where: { id }, data })
      // Утас/эзэн өөрчлөгдвөл гишүүн ачаануудад тусгана
      if (data.phone !== undefined) {
        await tx.shipment.updateMany({
          where: { batchId: id } as any,
          data: { phone: data.phone, userId: data.userId },
        })
      }
    }

    // Код нэмэх
    const addCodes = normCodes(body.addCodes)
    if (addCodes.length > 0) {
      const now = new Date()
      const phone = data.phone ?? batch.phone
      const userId = data.userId !== undefined ? data.userId : batch.userId
      const stamp = batch.status === 'EREEN_ARRIVED' ? { ereenArrivedAt: now } : { arrivedAt: now }
      for (const code of addCodes) {
        await tx.shipment.upsert({
          where: { trackCode_cargoId: { trackCode: code, cargoId } },
          update: { status: batch.status, ...stamp, batchId: id, phone, ...(userId ? { userId } : {}) } as any,
          create: { trackCode: code, status: batch.status, ...stamp, batchId: id, phone, cargoId, ...(userId ? { userId } : {}) } as any,
        })
      }
      changes.push(`нэмсэн: ${addCodes.join(', ')}`)
    }

    // Код хасах (багцаас салгана, ачаа нь устахгүй)
    const removeIds: number[] = Array.isArray(body.removeShipmentIds) ? body.removeShipmentIds.map(Number).filter(Boolean) : []
    if (removeIds.length > 0) {
      const removed = batch.shipments.filter((s: any) => removeIds.includes(s.id))
      await tx.shipment.updateMany({
        where: { id: { in: removeIds }, batchId: id } as any,
        data: { batchId: null } as any,
      })
      changes.push(`хассан: ${removed.map((s: any) => s.trackCode).join(', ')}`)
    }

    if (changes.length > 0) {
      await (tx as any).batchLog.create({
        data: { batchId: id, userId: user.userId, userName: user.name, action: 'edited', detail: changes.join(' · ') },
      })
    }
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireBatchAccess(req)
  if (auth.error) return auth.error
  const user = auth.user!
  const cargoId = user.cargoId!

  const { id } = await req.json()
  const batch = await (prisma as any).batch.findFirst({ where: { id: Number(id), cargoId } })
  if (!batch) return NextResponse.json({ error: 'Багц олдсонгүй' }, { status: 404 })
  if (batch.status === 'PICKED_UP') {
    return NextResponse.json({ error: 'Олгогдсон багцыг устгах боломжгүй' }, { status: 400 })
  }

  // Гишүүн ачаанууд багцаас салж хэвээр үлдэнэ (batchId null болно — onDelete: SetNull)
  await (prisma as any).batch.delete({ where: { id: Number(id) } })
  return NextResponse.json({ ok: true })
}

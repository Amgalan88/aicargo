import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { validateWarehouseSlug } from '@/lib/warehouse'
import { diffWarehouse, logWarehouseAction } from '@/lib/warehouse-log'

type Params = { params: Promise<{ id: string }> }

async function requireSuper(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return { error: unauthorized() }
  if (user.role !== 'SUPER_ADMIN') return { error: forbidden() }
  return { user }
}

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireSuper(req)
  if (auth.error) return auth.error

  const id = Number((await params).id)
  if (!id) return NextResponse.json({ error: 'ID буруу' }, { status: 400 })

  const warehouse = await prisma.partnerWarehouse.findUnique({
    where: { id },
    include: { images: { orderBy: [{ order: 'asc' }, { id: 'asc' }] } },
  })
  if (!warehouse) return NextResponse.json({ error: 'Агуулах олдсонгүй' }, { status: 404 })
  return NextResponse.json(warehouse)
}

const TEXT_FIELDS = [
  'legalNameMn', 'legalNameCn', 'registerNo', 'directorName',
  'bankName', 'bankAccount', 'bankHolder', 'services',
] as const

function parseMoney(v: unknown): number | null | 'invalid' {
  if (v === null || v === '' || v === undefined) return null
  const n = Number(String(v).replace(/[,\s]/g, ''))
  if (!Number.isFinite(n) || n < 0) return 'invalid'
  return n
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireSuper(req)
  if (auth.error) return auth.error

  const id = Number((await params).id)
  if (!id) return NextResponse.json({ error: 'ID буруу' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const data: Prisma.PartnerWarehouseUpdateInput = {}

  for (const f of TEXT_FIELDS) {
    if (body[f] !== undefined) data[f] = typeof body[f] === 'string' && body[f].trim() ? body[f].trim() : null
  }

  if (body.slug !== undefined) {
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
    if (slug) {
      const err = validateWarehouseSlug(slug)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
      const taken = await prisma.partnerWarehouse.findFirst({ where: { slug, id: { not: id } }, select: { id: true } })
      if (taken) return NextResponse.json({ error: 'Энэ холбоос өөр агуулахад ашиглагдсан байна' }, { status: 409 })
    }
    data.slug = slug || null
  }

  if (body.contractFee !== undefined) {
    const fee = parseMoney(body.contractFee)
    if (fee === null || fee === 'invalid' || fee <= 0) {
      return NextResponse.json({ error: 'Гэрээний төлбөр буруу байна' }, { status: 400 })
    }
    data.contractFee = fee
  }
  for (const f of ['pricePerTonCny', 'pricePerM3Cny', 'pricePerKgMnt'] as const) {
    if (body[f] === undefined) continue
    const v = parseMoney(body[f])
    if (v === 'invalid') return NextResponse.json({ error: 'Тарифын дүн буруу байна' }, { status: 400 })
    data[f] = v
  }

  if (body.acceptingContracts !== undefined) data.acceptingContracts = body.acceptingContracts === true

  const before = await prisma.partnerWarehouse.findUnique({ where: { id } })
  if (!before) return NextResponse.json({ error: 'Агуулах олдсонгүй' }, { status: 404 })

  const warehouse = await prisma.$transaction(async tx => {
    const updated = await tx.partnerWarehouse.update({ where: { id }, data })
    const { bank, other } = diffWarehouse(before, updated)
    const actor = { warehouseId: id, userId: auth.user.userId, userName: auth.user.name }
    // Данс солигдсон нь лог-гүйгээр хадгалагдах ёсгүй — transaction дотор шууд бичнэ
    if (bank.length) {
      await tx.warehouseLog.create({ data: { ...actor, action: 'BANK_CHANGED', detail: bank.join('\n') } })
    }
    if (other.length) {
      await logWarehouseAction(tx, { ...actor, action: 'SETTINGS_CHANGED', detail: other.join('\n') })
    }
    return updated
  })
  return NextResponse.json(warehouse)
}

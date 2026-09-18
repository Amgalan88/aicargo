import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCargoAdmin, bad, readJson } from '@/lib/contract-auth'
import {
  WAREHOUSE_CONTRACT_SELECT, warehouseReadiness, getLatestTemplate, addEvent, contractNoFor, isUniqueViolation,
} from '@/lib/contract-server'

const OPEN_STATUSES = ['DRAFT', 'AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'ACTIVE', 'TERMINATION_PENDING'] as const

export async function GET(req: NextRequest) {
  const auth = await requireCargoAdmin(req, false)
  if (auth.error) return auth.error
  const { cargoId } = auth.user

  const [contracts, warehouses] = await Promise.all([
    prisma.warehouseContract.findMany({
      where: { cargoId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, contractNo: true, status: true, fee: true, createdAt: true, cargoSignedAt: true,
        approvedAt: true, terminationEffectiveAt: true, terminatedAt: true, rejectReason: true,
        paymentClaimedAt: true, paidAt: true, websiteBonusAt: true,
        warehouse: { select: { id: true, name: true, imageUrl: true } },
      },
    }),
    prisma.partnerWarehouse.findMany({
      where: { active: true },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      select: { ...WAREHOUSE_CONTRACT_SELECT, imageUrl: true, _count: { select: { templates: true } } },
    }),
  ])

  const openByWarehouse = new Map(
    contracts.filter(c => (OPEN_STATUSES as readonly string[]).includes(c.status)).map(c => [c.warehouse.id, c.id]),
  )

  return NextResponse.json({
    canManage: !auth.user.isStaffAdmin,
    contracts,
    warehouses: warehouses.map(w => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      imageUrl: w.imageUrl,
      address: w.address,
      contractFee: w.contractFee,
      available: w.acceptingContracts && warehouseReadiness(w, w._count.templates > 0).length === 0,
      openContractId: openByWarehouse.get(w.id) ?? null,
    })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireCargoAdmin(req, true)
  if (auth.error) return auth.error
  const { user } = auth

  const body = await readJson<{ warehouseId?: number }>(req)
  const warehouseId = Number(body?.warehouseId)
  if (!warehouseId) return bad('Агуулах сонгоно уу')

  const warehouse = await prisma.partnerWarehouse.findFirst({
    where: { id: warehouseId, active: true },
    select: WAREHOUSE_CONTRACT_SELECT,
  })
  if (!warehouse) return bad('Агуулах олдсонгүй', 404)
  const template = await getLatestTemplate(prisma, warehouseId)
  if (!warehouse.acceptingContracts || !template || warehouseReadiness(warehouse, true).length) {
    return bad('Энэ агуулах одоогоор цахим гэрээ хүлээн авахгүй байна', 409)
  }

  const existing = await prisma.warehouseContract.findFirst({
    where: { cargoId: user.cargoId, warehouseId, status: { in: [...OPEN_STATUSES] } },
    select: { id: true },
  })
  if (existing) return NextResponse.json({ id: existing.id, existing: true })

  const [cargo, me] = await Promise.all([
    prisma.cargo.findUnique({ where: { id: user.cargoId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: user.userId }, select: { phone: true } }),
  ])

  try {
    const contract = await prisma.$transaction(async tx => {
      const created = await tx.warehouseContract.create({
        data: {
          contractNo: `TMP-${crypto.randomUUID()}`,
          warehouseId,
          cargoId: user.cargoId,
          templateId: template.id,
          fee: warehouse.contractFee,
          createdById: user.userId,
          values: JSON.stringify({
            cargoLegalName: cargo?.name ?? '',
            repPosition: 'Захирал',
            repPhone: me?.phone ?? '',
            destination: 'Улаанбаатар хот',
          }),
        },
        select: { id: true, createdAt: true },
      })
      await tx.warehouseContract.update({
        where: { id: created.id },
        data: { contractNo: contractNoFor(created.id, created.createdAt) },
      })
      await addEvent(tx, created.id, { id: user.userId, name: user.name }, 'CREATED')
      return created
    })
    return NextResponse.json({ id: contract.id }, { status: 201 })
  } catch (err) {
    // Зэрэг хоёр хүсэлт — DB-ийн "нэг амьд гэрээ" индекс хамгаална
    if (isUniqueViolation(err)) {
      const again = await prisma.warehouseContract.findFirst({
        where: { cargoId: user.cargoId, warehouseId, status: { in: [...OPEN_STATUSES] } },
        select: { id: true },
      })
      if (again) return NextResponse.json({ id: again.id, existing: true })
    }
    throw err
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/contract-auth'
import { STATUS_INFO, ContractStatus } from '@/lib/contract'
import { safeValues } from '@/lib/contract-server'

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req)
  if (auth.error) return auth.error

  const sp = req.nextUrl.searchParams
  // Цэсний тэмдэглэгээнд: анхаарах шаардлагатай гэрээний тоо
  if (sp.get('count') === 'pending') {
    const count = await prisma.warehouseContract.count({
      where: { status: { in: ['AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'TERMINATION_PENDING'] } },
    })
    return NextResponse.json({ count })
  }

  const status = sp.get('status')
  const q = sp.get('q')?.trim()
  const warehouseId = Number(sp.get('warehouseId')) || undefined
  const where: Prisma.WarehouseContractWhereInput = {
    status: status && status in STATUS_INFO ? (status as ContractStatus) : { not: 'DRAFT' },
    ...(warehouseId ? { warehouseId } : {}),
    ...(q ? {
      OR: [
        { contractNo: { contains: q, mode: 'insensitive' } },
        { cargo: { name: { contains: q, mode: 'insensitive' } } },
        { values: { contains: q, mode: 'insensitive' } },
      ],
    } : {}),
  }

  const [contracts, grouped] = await Promise.all([
    prisma.warehouseContract.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true, contractNo: true, status: true, fee: true, updatedAt: true, cargoSignedAt: true,
        paymentClaimedAt: true, approvedAt: true, terminationEffectiveAt: true, values: true,
        cargo: { select: { id: true, name: true, slug: true } },
        warehouse: { select: { id: true, name: true } },
      },
    }),
    prisma.warehouseContract.groupBy({ by: ['status'], _count: { _all: true } }),
  ])

  return NextResponse.json({
    contracts: contracts.map(({ values, ...c }) => ({ ...c, cargoLegalName: safeValues(values).cargoLegalName ?? '' })),
    counts: Object.fromEntries(grouped.map(g => [g.status, g._count._all])),
  })
}

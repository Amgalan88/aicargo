import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCargoAdmin } from '@/lib/contract-auth'
import { WAREHOUSE_CONTRACT_SELECT, LATEST_TEMPLATE_INCLUDE, warehouseReadiness } from '@/lib/contract-server'

const OPEN_STATUSES = ['AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'ACTIVE', 'TERMINATION_PENDING'] as const

// Каргод холбогдсон гэрээнүүд + агуулахууд. Гэрээ байгуулах нь хүн бүрт ижил нийтийн маягтаар
// (/warehouses/[slug]/contract); эзэмшигч гэрээгээ нууц холбоосоор нь, ажилтан зөвхөн харах горимоор нээнэ
export async function GET(req: NextRequest) {
  const auth = await requireCargoAdmin(req, false)
  if (auth.error) return auth.error
  const { cargoId, isStaffAdmin } = auth.user

  const [contracts, warehouses] = await Promise.all([
    prisma.warehouseContract.findMany({
      where: { cargoId, status: { not: 'DRAFT' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, contractNo: true, status: true, fee: true, createdAt: true, cargoSignedAt: true,
        approvedAt: true, terminationEffectiveAt: true, terminatedAt: true, rejectReason: true,
        paymentClaimedAt: true, paidAt: true, websiteBonusAt: true, accessToken: true,
        warehouse: { select: { id: true, name: true, imageUrl: true } },
      },
    }),
    prisma.partnerWarehouse.findMany({
      where: { active: true },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      select: { ...WAREHOUSE_CONTRACT_SELECT, imageUrl: true, ...LATEST_TEMPLATE_INCLUDE },
    }),
  ])

  const href = (c: { id: number; accessToken: string | null }) =>
    !isStaffAdmin && c.accessToken ? `/contracts/g/${c.accessToken}` : `/admin/warehouse/${c.id}`
  const openByWarehouse = new Map(
    contracts.filter(c => (OPEN_STATUSES as readonly string[]).includes(c.status)).map(c => [c.warehouse.id, href(c)]),
  )

  return NextResponse.json({
    canManage: !isStaffAdmin,
    contracts: contracts.map(({ accessToken: _t, ...c }) => ({ ...c, href: href({ id: c.id, accessToken: _t }) })),
    warehouses: warehouses.map(w => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      imageUrl: w.imageUrl,
      address: w.address,
      contractFee: w.contractFee,
      available: w.acceptingContracts && warehouseReadiness(w, w.templates[0]).length === 0,
      openContractHref: openByWarehouse.get(w.id) ?? null,
    })),
  })
}

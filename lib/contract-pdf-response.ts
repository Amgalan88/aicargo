import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { PDF_STATUSES, ContractStatus, parseBody } from '@/lib/contract'
import { safeValues } from '@/lib/contract-server'
import { renderContractPdf } from '@/lib/contract-pdf'

// where-д дуудагч талын эрхийн нөхцөл (жш: cargoId) заавал орно
export async function contractPdfResponse(where: Prisma.WarehouseContractWhereInput) {
  const c = await prisma.warehouseContract.findFirst({
    where,
    include: {
      warehouse: { select: { name: true, legalNameMn: true, legalNameCn: true, registerNo: true, directorName: true, address: true } },
    },
  })
  if (!c) return NextResponse.json({ error: 'Гэрээ олдсонгүй' }, { status: 404 })
  if (!PDF_STATUSES.includes(c.status as ContractStatus) || !c.renderedBody || !c.bodyHash || !c.cargoSignedAt || !c.approvedAt) {
    return NextResponse.json({ error: 'Гэрээ батлагдсаны дараа PDF татах боломжтой' }, { status: 403 })
  }

  const v = safeValues(c.values)
  const pdf = await renderContractPdf({
    contractNo: c.contractNo,
    body: parseBody(c.renderedBody),
    bodyHash: c.bodyHash,
    cargoSignedAt: c.cargoSignedAt,
    cargoSignerName: c.cargoSignerName ?? '',
    cargoSignerEmail: c.cargoSignerEmail,
    cargoSignIp: c.cargoSignIp,
    approvedAt: c.approvedAt,
    approvedByName: c.approvedByName ?? '',
    paidAt: c.paidAt,
    terminatedAt: c.terminatedAt,
    terminationEffectiveAt: c.terminationEffectiveAt,
    status: c.status,
    cargo: {
      legalName: v.cargoLegalName ?? '',
      registerNo: v.cargoRegisterNo ?? '',
      repName: [v.repLastName, v.repFirstName].filter(Boolean).join(' '),
      repPosition: v.repPosition ?? '',
      repPhone: v.repPhone ?? '',
    },
    warehouse: {
      legalNameMn: c.warehouse.legalNameMn ?? c.warehouse.name,
      legalNameCn: c.warehouse.legalNameCn ?? '',
      registerNo: c.warehouse.registerNo ?? '',
      director: c.warehouse.directorName ?? '',
      address: c.warehouse.address ?? '',
    },
    // PDF хэвлэгдэж удаан хадгалагдах тул preview домэйн биш үндсэн домэйныг бичнэ (sitemap-тай адил)
    verifyUrl: `https://www.aicargo.mn/contracts/verify/${c.contractNo}`,
  })

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${c.contractNo}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

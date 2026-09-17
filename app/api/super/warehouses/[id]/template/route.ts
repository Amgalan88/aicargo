import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin, bad, readJson } from '@/lib/contract-auth'
import {
  ContractBody, Clause, DEFAULT_TEMPLATE, ALL_PLACEHOLDERS, CARGO_FIELD_KEYS, parseBody, validateTemplate,
} from '@/lib/contract'
import { getLatestTemplate, warehouseReadiness, WAREHOUSE_CONTRACT_SELECT, isUniqueViolation } from '@/lib/contract-server'
import { logWarehouseAction } from '@/lib/warehouse-log'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireSuperAdmin(req)
  if (auth.error) return auth.error
  const warehouseId = Number((await params).id)
  const wh = warehouseId
    ? await prisma.partnerWarehouse.findUnique({ where: { id: warehouseId }, select: WAREHOUSE_CONTRACT_SELECT })
    : null
  if (!wh) return bad('Агуулах олдсонгүй', 404)

  const latest = await getLatestTemplate(prisma, warehouseId)
  const body: ContractBody = latest
    ? { titleMn: latest.titleMn, titleCn: latest.titleCn, clauses: parseBody(latest.body).clauses }
    : DEFAULT_TEMPLATE

  return NextResponse.json({
    saved: !!latest,
    version: latest?.version ?? 0,
    savedAt: latest?.createdAt ?? null,
    savedBy: latest?.createdBy ?? null,
    body,
    placeholders: ALL_PLACEHOLDERS,
    cargoFields: CARGO_FIELD_KEYS,
    readiness: warehouseReadiness(wh, !!latest),
    acceptingContracts: wh.acceptingContracts,
  })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireSuperAdmin(req)
  if (auth.error) return auth.error
  const warehouseId = Number((await params).id)
  const wh = warehouseId ? await prisma.partnerWarehouse.findUnique({ where: { id: warehouseId }, select: { id: true } }) : null
  if (!wh) return bad('Агуулах олдсонгүй', 404)

  const input = await readJson<Partial<ContractBody>>(req)
  if (!input) return bad('Invalid JSON')
  const body: ContractBody = {
    titleMn: String(input.titleMn ?? '').trim(),
    titleCn: String(input.titleCn ?? '').trim(),
    clauses: (Array.isArray(input.clauses) ? input.clauses : []).map((c: Partial<Clause>) => ({
      kind: c.kind as Clause['kind'],
      ...(c.kind === 'clause' && c.no?.trim() ? { no: c.no.trim().slice(0, 12) } : {}),
      mn: String(c.mn ?? '').trim(),
      cn: String(c.cn ?? '').trim(),
    })),
  }
  const err = validateTemplate(body)
  if (err) return bad(err)

  const latest = await getLatestTemplate(prisma, warehouseId)
  if (latest && latest.titleMn === body.titleMn && latest.titleCn === body.titleCn
      && JSON.stringify(parseBody(latest.body).clauses) === JSON.stringify(body.clauses)) {
    return NextResponse.json({ ok: true, version: latest.version, unchanged: true })
  }

  try {
    const created = await prisma.contractTemplate.create({
      data: {
        warehouseId,
        version: (latest?.version ?? 0) + 1,
        titleMn: body.titleMn,
        titleCn: body.titleCn,
        body: JSON.stringify({ clauses: body.clauses }),
        createdBy: auth.user.name,
      },
      select: { version: true, createdAt: true },
    })
    await logWarehouseAction(prisma, {
      warehouseId, userId: auth.user.userId, userName: auth.user.name,
      action: 'TEMPLATE_SAVED', detail: `Хувилбар ${created.version} · ${body.clauses.length} мөр`,
    })
    return NextResponse.json({ ok: true, version: created.version, savedAt: created.createdAt })
  } catch (e) {
    if (isUniqueViolation(e)) return bad('Өөр хүн зэрэг хадгалсан байна. Хуудсаа сэргээнэ үү', 409)
    throw e
  }
}

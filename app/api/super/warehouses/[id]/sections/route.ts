import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { logWarehouseAction } from '@/lib/warehouse-log'
import { normalizeSectionCode, expandSectionRange, compareSectionCode, MAX_SECTIONS_PER_REQUEST } from '@/lib/warehouse'

type Params = { params: Promise<{ id: string }> }

async function requireSuperWarehouse(req: NextRequest, params: Params['params']) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return { error: unauthorized() }
  if (user.role !== 'SUPER_ADMIN') return { error: forbidden() }
  const warehouseId = Number((await params).id)
  if (!warehouseId) return { error: NextResponse.json({ error: 'ID буруу' }, { status: 400 }) }
  const wh = await prisma.partnerWarehouse.findUnique({ where: { id: warehouseId }, select: { id: true } })
  if (!wh) return { error: NextResponse.json({ error: 'Агуулах олдсонгүй' }, { status: 404 }) }
  return { warehouseId, user }
}

async function listSections(warehouseId: number) {
  const rows = await prisma.warehouseSection.findMany({
    where: { warehouseId },
    select: { id: true, code: true, note: true, active: true, createdAt: true },
  })
  return rows.sort((a, b) => compareSectionCode(a.code, b.code))
}

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireSuperWarehouse(req, params)
  if (auth.error) return auth.error
  return NextResponse.json(await listSections(auth.warehouseId))
}

// { code, note? } — нэг хэсэг
// { prefix, from, to } — олноор (жш: A-1 … A-20)
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireSuperWarehouse(req, params)
  if (auth.error) return auth.error
  const { warehouseId, user } = auth

  let body: { code?: string; note?: string; prefix?: string; from?: number; to?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  let codes: string[]
  if (body.prefix !== undefined || body.from !== undefined || body.to !== undefined) {
    const res = expandSectionRange(body.prefix ?? '', Number(body.from), Number(body.to))
    if (typeof res === 'string') return NextResponse.json({ error: res }, { status: 400 })
    codes = res
  } else {
    const code = normalizeSectionCode(body.code ?? '')
    if (!code) return NextResponse.json({ error: 'Хэсгийн код оруулна уу (жш: A-12)' }, { status: 400 })
    codes = [code]
  }
  if (codes.length > MAX_SECTIONS_PER_REQUEST) {
    return NextResponse.json({ error: `Нэг удаад хамгийн ихдээ ${MAX_SECTIONS_PER_REQUEST} хэсэг нэмнэ` }, { status: 400 })
  }

  const note = codes.length === 1 ? body.note?.trim() || null : null
  const result = await prisma.warehouseSection.createMany({
    data: codes.map(code => ({ warehouseId, code, note })),
    skipDuplicates: true,
  })
  if (result.count === 0) {
    return NextResponse.json({ error: codes.length === 1 ? 'Энэ код бүртгэлтэй байна' : 'Бүх код бүртгэлтэй байна' }, { status: 409 })
  }

  await logWarehouseAction(prisma, {
    warehouseId, userId: user.userId, userName: user.name, action: 'SECTION_ADDED',
    detail: codes.length === 1 ? codes[0] : `${codes[0]} … ${codes[codes.length - 1]} (${result.count} шинэ)`,
  })
  return NextResponse.json({ created: result.count, skipped: codes.length - result.count, sections: await listSections(warehouseId) }, { status: 201 })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireSuperWarehouse(req, params)
  if (auth.error) return auth.error
  const { warehouseId, user } = auth

  let body: { id?: number; code?: string; note?: string; active?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const section = await prisma.warehouseSection.findFirst({
    where: { id: Number(body.id), warehouseId },
    select: { id: true, code: true, note: true, active: true },
  })
  if (!section) return NextResponse.json({ error: 'Хэсэг олдсонгүй' }, { status: 404 })

  const data: { code?: string; note?: string | null; active?: boolean } = {}
  if (body.code !== undefined) {
    const code = normalizeSectionCode(body.code)
    if (!code) return NextResponse.json({ error: 'Хэсгийн код хоосон байна' }, { status: 400 })
    if (code !== section.code) {
      const taken = await prisma.warehouseSection.findFirst({ where: { warehouseId, code }, select: { id: true } })
      if (taken) return NextResponse.json({ error: 'Энэ код бүртгэлтэй байна' }, { status: 409 })
      data.code = code
    }
  }
  if (body.note !== undefined) data.note = body.note?.trim() || null
  if (body.active !== undefined) data.active = body.active === true

  const updated = await prisma.warehouseSection.update({
    where: { id: section.id },
    data,
    select: { id: true, code: true, note: true, active: true, createdAt: true },
  })

  const changes = [
    data.code !== undefined && `Код: ${section.code} → ${data.code}`,
    data.note !== undefined && data.note !== section.note && `Тэмдэглэл: ${section.note ?? '—'} → ${data.note ?? '—'}`,
    data.active !== undefined && data.active !== section.active && (data.active ? 'Идэвхжүүлсэн' : 'Идэвхгүй болгосон'),
  ].filter(Boolean)
  if (changes.length) {
    await logWarehouseAction(prisma, {
      warehouseId, userId: user.userId, userName: user.name, action: 'SECTION_UPDATED',
      detail: `${updated.code}: ${changes.join(', ')}`,
    })
  }
  return NextResponse.json(updated)
}

// Фаз 3-т гэрээнд оногдсон хэсгийг устгахыг хориглоно — одоохондоо гэрээ байхгүй
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireSuperWarehouse(req, params)
  if (auth.error) return auth.error
  const { warehouseId, user } = auth

  let body: { id?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const section = await prisma.warehouseSection.findFirst({
    where: { id: Number(body.id), warehouseId },
    select: { id: true, code: true },
  })
  if (!section) return NextResponse.json({ error: 'Хэсэг олдсонгүй' }, { status: 404 })

  await prisma.warehouseSection.delete({ where: { id: section.id } })
  await logWarehouseAction(prisma, {
    warehouseId, userId: user.userId, userName: user.name, action: 'SECTION_DELETED', detail: section.code,
  })
  return NextResponse.json({ ok: true })
}

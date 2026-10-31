import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { parseTrackCode } from '@/lib/track-code'
import { auditLater } from '@/lib/audit'
import { dispatchEnabledFor, statsFor } from '@/lib/dispatch'
import { MAX_IMPORT_ROWS } from '@/lib/import-limits'

async function guard(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return { error: unauthorized() }
  if (admin.role !== 'ADMIN' || !admin.cargoId) return { error: forbidden() }
  if (!(await dispatchEnabledFor(admin.cargoId))) {
    return { error: NextResponse.json({ error: 'Ачилт энэ каргод идэвхжээгүй байна' }, { status: 403 }) }
  }
  return { admin }
}

// GET — ачилтууд (сүүлийнх нь эхэнд) + тулгалтын тоо; ?open=1 бол зөвхөн нээлттэй ("Ирсэн" хуудасны сонголт)
export async function GET(req: NextRequest) {
  const g = await guard(req)
  if (g.error) return g.error
  const cargoId = g.admin.cargoId!
  const onlyOpen = req.nextUrl.searchParams.get('open') === '1'
  const list = await prisma.dispatch.findMany({
    where: { cargoId, ...(onlyOpen ? { closedAt: null } : {}) },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: onlyOpen ? 30 : 100,
    select: { id: true, date: true, name: true, closedAt: true, createdByName: true, createdAt: true },
  })
  const stats = await statsFor(cargoId, list.map(d => d.id))
  return NextResponse.json(list.map(d => ({ ...d, stats: stats.get(d.id) ?? { loaded: 0, arrived: 0, missing: 0, extra: 0 } })))
}

// POST { date: 'YYYY-MM-DD', name?, codes: string[] } — агуулахын жагсаалтаас шинэ ачилт
export async function POST(req: NextRequest) {
  const g = await guard(req)
  if (g.error) return g.error
  const admin = g.admin
  const body = await req.json().catch(() => ({}))
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null
  if (!date) return NextResponse.json({ error: 'Ачигдсан огноо оруулна уу' }, { status: 400 })
  const raw: unknown[] = Array.isArray(body.codes) ? body.codes : []
  if (raw.length > MAX_IMPORT_ROWS) return NextResponse.json({ error: `Нэг ачилтад ${MAX_IMPORT_ROWS} хүртэл код` }, { status: 400 })
  const codes = [...new Set(raw.map(c => parseTrackCode(c)).filter((c): c is string => !!c))]
  if (!codes.length) return NextResponse.json({ error: 'Трак код олдсонгүй' }, { status: 400 })

  const d = await prisma.dispatch.create({
    data: {
      cargoId: admin.cargoId!, date: new Date(`${date}T12:00:00+08:00`),
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : null,
      createdById: admin.userId, createdByName: admin.name,
      items: { createMany: { data: codes.map(trackCode => ({ trackCode })) } },
    },
    select: { id: true },
  })
  auditLater({
    cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name,
    action: 'dispatch:create', detail: `${date} · ${codes.length} код`,
  })
  return NextResponse.json({ id: d.id, count: codes.length })
}

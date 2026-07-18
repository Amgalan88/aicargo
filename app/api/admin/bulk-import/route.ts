import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { checkCrossCargoOnImport } from '@/lib/notifications'

// Excel-ээс олон зуун мөр орж ирж болдог тул мөр мөрөөр DB руу хандвал
// round-trip хэтэрч timeout болно (batch feature дээр олдсонтой ижил алдаа) —
// доор бүх мөрийг НЭГ bulk upsert query-гээр бичнэ.
export const maxDuration = 60

interface ImportRow {
  trackCode: string
  status: 'EREEN_ARRIVED' | 'ARRIVED'
  phone?: string
}

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const raw = req.nextUrl.searchParams.get('codes') ?? ''
  const codes = raw.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
  if (codes.length === 0) return NextResponse.json({ duplicates: [] })

  const existing = await prisma.shipment.findMany({
    where: { cargoId: admin.cargoId!, trackCode: { in: codes }, status: 'EREEN_ARRIVED' },
    select: { trackCode: true },
  })
  return NextResponse.json({ duplicates: existing.map(e => e.trackCode) })
}

export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const body = await req.json()
  const rows: ImportRow[] = body.rows

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'Өгөгдөл хоосон байна' }, { status: 400 })
  }
  const cargoId = admin.cargoId!

  // Нэг импортод ижил код давхар орвол сүүлийнх нь дийлдэнэ (bulk upsert нэг
  // conflict target-ийг хоёр удаа хөндөж чадахгүй тул урьдчилан dedupe хийнэ)
  const rowByCode = new Map<string, ImportRow>()
  for (const r of rows) rowByCode.set(r.trackCode.trim().toUpperCase(), r)
  const codes = Array.from(rowByCode.keys())

  // Одоо байгаа ачаануудыг (эзний утастай нь) НЭГ query-гээр бүгдийг татна
  const existingRows = await prisma.shipment.findMany({
    where: { cargoId, trackCode: { in: codes } },
    include: { user: { select: { phone: true } } },
  })
  const existingByCode = new Map(existingRows.map(s => [s.trackCode, s]))
  const duplicates = existingRows.filter(s => s.status === 'EREEN_ARRIVED').map(s => s.trackCode)

  // Утсаар эзнийг холбохын тулд шаардлагатай утаснуудыг НЭГ query-гээр татна
  // (гар/Excel-ээр орсон утас одоо байгаа жинхэнэ утсыг дарж бичихгүй байхаар
  // arrived route-той адил дараалалтай: эзний утас → одоогийн утас → гараар орсон утас)
  const resolvedPhoneByCode = new Map<string, string | null>()
  const phonesNeedingLookup = new Set<string>()
  for (const code of codes) {
    const existing = existingByCode.get(code)
    const manualPhone = rowByCode.get(code)!.phone?.trim() || null
    const resolvedPhone = existing?.user?.phone || existing?.phone || manualPhone || null
    resolvedPhoneByCode.set(code, resolvedPhone)
    if (!existing?.userId && resolvedPhone) phonesNeedingLookup.add(resolvedPhone)
  }
  const matchedUsers = phonesNeedingLookup.size > 0
    ? await prisma.user.findMany({ where: { cargoId, phone: { in: Array.from(phonesNeedingLookup) } }, select: { id: true, phone: true } })
    : []
  const userIdByPhone = new Map(matchedUsers.map(u => [u.phone, u.id]))

  const statuses: string[] = []
  const phones: (string | null)[] = []
  const userIds: (number | null)[] = []
  for (const code of codes) {
    const existing = existingByCode.get(code)
    const resolvedPhone = resolvedPhoneByCode.get(code) ?? null
    const resolvedUserId = existing?.userId ?? (resolvedPhone ? userIdByPhone.get(resolvedPhone) ?? null : null)
    statuses.push(rowByCode.get(code)!.status)
    phones.push(resolvedPhone)
    userIds.push(resolvedUserId)
  }

  const now = new Date()
  await prisma.$executeRaw`
    INSERT INTO "Shipment" ("trackCode", status, "arrivedAt", "ereenArrivedAt", phone, "cargoId", "userId", "createdAt", "updatedAt")
    SELECT t.code, t.status::"Status",
      CASE WHEN t.status = 'ARRIVED' THEN ${now}::timestamp ELSE NULL END,
      CASE WHEN t.status = 'EREEN_ARRIVED' THEN ${now}::timestamp ELSE NULL END,
      t.phone, ${cargoId}, t.userId, ${now}, ${now}
    FROM unnest(${codes}::text[], ${statuses}::text[], ${phones}::text[], ${userIds}::int[]) AS t(code, status, phone, userId)
    ON CONFLICT ("trackCode", "cargoId") DO UPDATE SET
      status = EXCLUDED.status,
      "arrivedAt" = CASE WHEN EXCLUDED.status = 'ARRIVED' THEN EXCLUDED."arrivedAt" ELSE "Shipment"."arrivedAt" END,
      "ereenArrivedAt" = CASE WHEN EXCLUDED.status = 'EREEN_ARRIVED' THEN EXCLUDED."ereenArrivedAt" ELSE "Shipment"."ereenArrivedAt" END,
      phone = COALESCE(EXCLUDED.phone, "Shipment".phone),
      "userId" = COALESCE(EXCLUDED."userId", "Shipment"."userId"),
      "updatedAt" = EXCLUDED."updatedAt"
    WHERE "Shipment".status NOT IN ('ARRIVED', 'PICKED_UP')
  `

  // Cross-cargo check: notify if any imported codes belong to sibling cargo users
  checkCrossCargoOnImport(
    rows.map(r => ({ trackCode: r.trackCode.trim().toUpperCase(), phone: r.phone?.trim() || null, status: r.status })),
    cargoId
  ).catch(console.error)

  return NextResponse.json({ count: rows.length, duplicates })
}

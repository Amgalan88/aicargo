import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { notifyEreenForCargo, notifyArrivedForCargo } from '@/lib/push'
import { auditLater } from '@/lib/audit'
import { parseTrackCode, parseArrivedCode } from '@/lib/track-code'
import { checkCrossCargoOnImport } from '@/lib/notifications'
import { resolveImportOwners } from '@/lib/import-owner'

// Excel-ээс олон зуун мөр орж ирж болдог тул мөр мөрөөр DB руу хандвал
// round-trip хэтэрч timeout болно (batch feature дээр олдсонтой ижил алдаа) —
// доор бүх мөрийг НЭГ bulk upsert query-гээр бичнэ.
export const maxDuration = 60

// "YYYY-MM-DD" (УБ) → тэр өдрийн 12:00 УБ; өнөөдөр эсвэл хоосон бол одоо. Ирээдүй, 30 хоногоос хуучин бол null
function ereenArrivedAtFrom(date: unknown, now: Date): Date | null {
  if (!date) return now
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const todayUB = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
  if (date === todayUB) return now
  const at = new Date(`${date}T12:00:00+08:00`)
  if (isNaN(at.getTime()) || date > todayUB || now.getTime() - at.getTime() > 31 * 86400_000) return null
  return at
}

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
  const notCodes: string[] = []
  for (const r of rows) {
    // Эрээн — заавал ачааны код; Ирсэн — төлбөр, барааны нэр ч зөвшөөрнө
    const c = r.status === 'ARRIVED' ? parseArrivedCode(r.trackCode) : parseTrackCode(r.trackCode)
    if (c) rowByCode.set(c, { ...r, trackCode: c })
    else notCodes.push(String(r.trackCode ?? '').slice(0, 40))
  }
  const codes = Array.from(rowByCode.keys())
  if (!codes.length) return NextResponse.json({ error: 'Трак код олдсонгүй', notCodes: notCodes.slice(0, 10) }, { status: 400 })

  // Одоо байгаа ачаануудыг (эзний утастай нь) НЭГ query-гээр бүгдийг татна
  const existingRows = await prisma.shipment.findMany({
    where: { cargoId, trackCode: { in: codes } },
    include: { user: { select: { phone: true } } },
  })
  const existingByCode = new Map(existingRows.map(s => [s.trackCode, s]))
  const duplicates = existingRows.filter(s => s.status === 'EREEN_ARRIVED').map(s => s.trackCode)

  // Эзэн: Excel-ийн утас давуу, утасгүй бол бүртгүүлсэн хэрэглэгч хэвээр (lib/import-owner, arrived route-той ижил)
  const { phones, userIds, changes } = await resolveImportOwners(
    cargoId, codes, new Map(codes.map(c => [c, rowByCode.get(c)!.phone])), existingByCode,
  )
  const statuses = codes.map(c => rowByCode.get(c)!.status as string)
  // Ирсэн, олгогдсон ачааг доорх upsert хөндөхгүй тул эзэн нь ч солигдохгүй
  const ownerChanges = changes.filter(x => !['ARRIVED', 'PICKED_UP'].includes(existingByCode.get(x.trackCode)?.status ?? ''))
  const duplicateRows = rows.length - notCodes.length - codes.length

  const now = new Date()
  // Эрээнд ирсэн огноо: админ сонговол тэр өдөр (жш 23-нд ирснийг 25-нд оруулах), үгүй бол одоо
  const ereenAt = ereenArrivedAtFrom(body.ereenDate, now)
  if (!ereenAt) return NextResponse.json({ error: 'Огноо буруу — өнөөдрөөс 30 хоногийн дотор сонгоно уу' }, { status: 400 })
  await prisma.$executeRaw`
    INSERT INTO "Shipment" ("trackCode", status, "arrivedAt", "ereenArrivedAt", phone, "cargoId", "userId", "createdAt", "updatedAt")
    SELECT t.code, t.status::"Status",
      CASE WHEN t.status = 'ARRIVED' THEN ${now}::timestamp ELSE NULL END,
      CASE WHEN t.status = 'EREEN_ARRIVED' THEN ${ereenAt}::timestamp ELSE NULL END,
      t.phone, ${cargoId}, t.userId, ${now}, ${now}
    FROM unnest(${codes}::text[], ${statuses}::text[], ${phones}::text[], ${userIds}::int[]) AS t(code, status, phone, userId)
    ON CONFLICT ("trackCode", "cargoId") DO UPDATE SET
      status = EXCLUDED.status,
      "arrivedAt" = CASE WHEN EXCLUDED.status = 'ARRIVED' THEN EXCLUDED."arrivedAt" ELSE "Shipment"."arrivedAt" END,
      "ereenArrivedAt" = CASE WHEN EXCLUDED.status = 'EREEN_ARRIVED' THEN EXCLUDED."ereenArrivedAt" ELSE "Shipment"."ereenArrivedAt" END,
      phone = COALESCE(EXCLUDED.phone, "Shipment".phone),
      "userId" = EXCLUDED."userId",
      "updatedAt" = EXCLUDED."updatedAt"
    WHERE "Shipment".status NOT IN ('ARRIVED', 'PICKED_UP')
  `

  // Cross-cargo check: notify if any imported codes belong to sibling cargo users
  checkCrossCargoOnImport(
    [...rowByCode.values()].map(r => ({ trackCode: r.trackCode, phone: r.phone?.trim() || null, status: r.status })),
    cargoId
  ).catch(console.error)

  // Шинээр Эрээнд ирсэн (өмнө нь бүртгэлтэй эсвэл огт байгаагүй) ачааны эзэнд push
  const ereenNew = codes
    .map((code, i) => ({ code, i, prev: existingByCode.get(code)?.status }))
    .filter(x => statuses[x.i] === 'EREEN_ARRIVED' && (!x.prev || x.prev === 'REGISTERED') && userIds[x.i])
    .map(x => ({ userId: userIds[x.i], trackCode: x.code }))
  if (ereenNew.length) after(() => notifyEreenForCargo(cargoId, ereenNew))
  const arrivedNew = codes
    .map((code, i) => ({ code, i, prev: existingByCode.get(code)?.status }))
    .filter(x => statuses[x.i] === 'ARRIVED' && x.prev !== 'ARRIVED' && x.prev !== 'PICKED_UP' && userIds[x.i])
    .map(x => ({ userId: userIds[x.i], trackCode: x.code }))
  if (arrivedNew.length) after(() => notifyArrivedForCargo(cargoId, arrivedNew))

  const nEreen = statuses.filter(x => x === 'EREEN_ARRIVED').length
  auditLater({
    cargoId, userId: admin.userId, userName: admin.name,
    action: 'shipment:import',
    detail: [nEreen && `Эрээн ${nEreen}`, codes.length - nEreen && `Ирсэн ${codes.length - nEreen}`].filter(Boolean).join(' · ') + ' ачаа'
      + (ownerChanges.length ? ` · ${ownerChanges.length} ачааны эзэн Excel-ийн утсаар солигдсон` : ''),
  })

  return NextResponse.json({
    count: codes.length, duplicates, notCodes: notCodes.slice(0, 10), notCodeCount: notCodes.length,
    duplicateRows, ownerChanges: ownerChanges.slice(0, 200), ownerChangeCount: ownerChanges.length,
  })
}

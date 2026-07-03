import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { checkCrossCargoOnImport } from '@/lib/notifications'

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

  const codes = rows.map(r => r.trackCode.trim().toUpperCase())

  // Find which codes are already EREEN_ARRIVED
  const existing = await prisma.shipment.findMany({
    where: { cargoId: admin.cargoId!, trackCode: { in: codes }, status: 'EREEN_ARRIVED' },
    select: { trackCode: true },
  })
  const duplicates = existing.map(e => e.trackCode)

  const results = await Promise.all(
    rows.map(async ({ trackCode, status, phone }) => {
      const code = trackCode.trim().toUpperCase()
      const ph = phone?.trim() || null
      const existing = await prisma.shipment.findUnique({
        where: { trackCode_cargoId: { trackCode: code, cargoId: admin.cargoId! } },
      })

      let resolvedUserId: number | null = existing?.userId ?? null
      const resolvedPhone = ph || existing?.phone || null
      if (!resolvedUserId && resolvedPhone) {
        const user = await prisma.user.findFirst({ where: { phone: resolvedPhone, cargoId: admin.cargoId! } })
        if (user) resolvedUserId = user.id
      }

      const stamp = status === 'ARRIVED'
        ? { arrivedAt: new Date() }
        : { ereenArrivedAt: new Date() }

      if (existing) {
        if (existing.status === 'ARRIVED' || existing.status === 'PICKED_UP') {
          return existing
        }
        return prisma.shipment.update({
          where: { trackCode_cargoId: { trackCode: code, cargoId: admin.cargoId! } },
          data: { status, ...stamp, ...(resolvedPhone ? { phone: resolvedPhone } : {}), ...(resolvedUserId ? { userId: resolvedUserId } : {}) },
        })
      }
      return prisma.shipment.create({
        data: { trackCode: code, status, ...stamp, cargoId: admin.cargoId!, phone: resolvedPhone, ...(resolvedUserId ? { userId: resolvedUserId } : {}) },
      })
    })
  )

  // Cross-cargo check: notify if any imported codes belong to sibling cargo users
  checkCrossCargoOnImport(
    rows.map(r => ({ trackCode: r.trackCode.trim().toUpperCase(), phone: r.phone?.trim() || null, status: r.status })),
    admin.cargoId!
  ).catch(console.error)

  return NextResponse.json({ count: results.length, duplicates })
}

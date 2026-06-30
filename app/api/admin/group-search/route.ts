import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'Хайлтын утга оруулна уу' }, { status: 400 })

  const cargo = await (prisma.cargo as any).findUnique({
    where: { id: admin.cargoId! },
    select: { groupId: true },
  })
  if (!cargo?.groupId) return NextResponse.json({ error: 'Групп байхгүй' }, { status: 403 })

  const groupCargos = await (prisma.cargo as any).findMany({
    where: { groupId: cargo.groupId },
    select: { id: true, name: true },
  })
  const cargoIds = groupCargos.map((c: any) => c.id)
  const cargoNameMap: Record<number, string> = Object.fromEntries(groupCargos.map((c: any) => [c.id, c.name]))

  const shipments = await prisma.shipment.findMany({
    where: {
      cargoId: { in: cargoIds },
      archived: false,
      trackCode: { contains: q.toUpperCase(), mode: 'insensitive' },
    },
    select: {
      trackCode: true,
      description: true,
      status: true,
      phone: true,
      adminPrice: true,
      cargoId: true,
      updatedAt: true,
      user: { select: { name: true, phone: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(
    shipments.map(s => ({
      ...s,
      cargoName: cargoNameMap[s.cargoId] ?? '',
      isOwn: s.cargoId === admin.cargoId,
    }))
  )
}

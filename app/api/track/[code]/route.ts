import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUserFromRequest } from '@/lib/auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const q = code.toUpperCase().trim()

  const authUser = getAuthUserFromRequest(req)

  // Logged-in user: scope to their cargo only
  if (authUser?.cargoId) {
    const shipment = await prisma.shipment.findFirst({
      where: { trackCode: q, cargoId: authUser.cargoId },
      select: {
        trackCode: true, description: true, status: true, phone: true,
        adminPrice: true, adminNote: true, createdAt: true, updatedAt: true,
        cargo: { select: { name: true } },
        user: { select: { name: true, phone: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })
    if (!shipment) return NextResponse.json({ error: 'Бараа олдсонгүй' }, { status: 404 })
    return NextResponse.json(shipment)
  }

  // Public search: use subdomain slug to find cargo + group
  const slug = req.headers.get('x-cargo-slug')
  let cargoIds: number[] | null = null

  if (slug) {
    const cargo = await (prisma.cargo as any).findUnique({
      where: { slug },
      select: { id: true, groupId: true },
    })
    if (cargo) {
      if (cargo.groupId) {
        const groupCargos = await (prisma.cargo as any).findMany({
          where: { groupId: cargo.groupId },
          select: { id: true },
        })
        cargoIds = groupCargos.map((c: any) => c.id)
      } else {
        cargoIds = [cargo.id]
      }
    }
  }

  const where = cargoIds
    ? { trackCode: q, cargoId: { in: cargoIds } }
    : { trackCode: q }

  const shipment = await prisma.shipment.findFirst({
    where,
    select: {
      trackCode: true, description: true, status: true, phone: true,
      adminPrice: true, adminNote: true, createdAt: true, updatedAt: true,
      cargo: { select: { name: true } },
      user: { select: { name: true, phone: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  if (!shipment) return NextResponse.json({ error: 'Бараа олдсонгүй' }, { status: 404 })
  return NextResponse.json(shipment)
}

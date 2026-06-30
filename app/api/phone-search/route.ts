import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone')?.trim()
  if (!phone) return NextResponse.json({ error: 'Утас оруулна уу' }, { status: 400 })

  const slug = req.headers.get('x-cargo-slug')
  if (!slug) return NextResponse.json({ error: 'Cargo олдсонгүй' }, { status: 400 })

  const cargo = await (prisma.cargo as any).findUnique({
    where: { slug },
    select: { id: true, searchByPhone: true },
  })
  if (!cargo) return NextResponse.json({ error: 'Cargo олдсонгүй' }, { status: 404 })
  if (!cargo.searchByPhone) return NextResponse.json({ error: 'Утасаар хайх боломжгүй' }, { status: 403 })

  const shipments = await prisma.shipment.findMany({
    where: {
      cargoId: cargo.id,
      phone,
      status: { in: ['EREEN_ARRIVED', 'ARRIVED'] },
      archived: false,
    },
    select: {
      trackCode: true,
      description: true,
      status: true,
      adminPrice: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(shipments)
}

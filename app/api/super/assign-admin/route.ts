import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const { phone, cargoId } = await req.json()

  if (!phone || !cargoId) {
    return NextResponse.json({ error: 'Утас болон карго шаардлагатай' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { phone } })
  if (!target) {
    return NextResponse.json({ error: 'Хэрэглэгч олдсонгүй' }, { status: 404 })
  }

  const cargo = await prisma.cargo.findUnique({ where: { id: Number(cargoId) } })
  if (!cargo) {
    return NextResponse.json({ error: 'Карго олдсонгүй' }, { status: 404 })
  }

  const updated = await prisma.user.update({
    where: { phone },
    data: { role: 'ADMIN', cargoId: Number(cargoId) },
    select: { id: true, name: true, phone: true, role: true, cargoId: true },
  })

  return NextResponse.json(updated)
}

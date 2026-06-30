import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const groups = await (prisma.cargoGroup as any).findMany({
    include: { cargos: { select: { id: true, name: true, slug: true, logoUrl: true, notificationsEnabled: true } } },
    orderBy: { id: 'asc' },
  })
  return NextResponse.json(groups)
}

export async function POST(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Нэр оруулна уу' }, { status: 400 })

  const group = await (prisma.cargoGroup as any).create({ data: { name: name.trim() } })
  return NextResponse.json(group, { status: 201 })
}

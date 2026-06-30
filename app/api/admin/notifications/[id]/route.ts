import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') return forbidden()
  if (!user.cargoId) return NextResponse.json({ error: 'CargoId шаардлагатай' }, { status: 400 })

  const { id } = await params
  const notifId = Number(id)
  if (!notifId) return NextResponse.json({ error: 'ID буруу' }, { status: 400 })

  const { read, archived } = await req.json()

  const notif = await (prisma.notification as any).findUnique({ where: { id: notifId } })
  if (!notif || notif.cargoId !== user.cargoId) {
    return NextResponse.json({ error: 'Олдсонгүй' }, { status: 404 })
  }

  const updated = await (prisma.notification as any).update({
    where: { id: notifId },
    data: {
      ...(read !== undefined ? { read } : {}),
      ...(archived !== undefined ? { archived } : {}),
    },
  })

  return NextResponse.json(updated)
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

// PATCH: rename group or set cargos
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const { id } = await params
  const groupId = Number(id)
  const { name, cargoIds, notificationsEnabled } = await req.json()

  if (name !== undefined) {
    await (prisma.cargoGroup as any).update({ where: { id: groupId }, data: { name: name.trim() } })
  }

  // Toggle notifications for ALL cargos in this group at once
  if (notificationsEnabled !== undefined) {
    await (prisma.cargo as any).updateMany({
      where: { groupId },
      data: { notificationsEnabled: Boolean(notificationsEnabled) },
    })
  }

  if (cargoIds !== undefined) {
    // Remove all cargos from group, then assign new ones
    await (prisma.cargo as any).updateMany({ where: { groupId }, data: { groupId: null } })
    if (cargoIds.length > 0) {
      await (prisma.cargo as any).updateMany({ where: { id: { in: cargoIds } }, data: { groupId } })
    }
  }

  const group = await (prisma.cargoGroup as any).findUnique({
    where: { id: groupId },
    include: { cargos: { select: { id: true, name: true, slug: true, logoUrl: true } } },
  })
  return NextResponse.json(group)
}

// DELETE: remove group (ungrouping all cargos)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const { id } = await params
  const groupId = Number(id)

  await (prisma.cargo as any).updateMany({ where: { groupId }, data: { groupId: null } })
  await (prisma.cargoGroup as any).delete({ where: { id: groupId } })
  return NextResponse.json({ ok: true })
}

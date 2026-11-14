import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

// Салбарын санал: зөвхөн энэ админы групп дэх карго. Бичилтгүй.
export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  if (!admin.cargoId) return NextResponse.json({ branches: [] })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase()
  const mine = await prisma.cargo.findUnique({
    where: { id: admin.cargoId },
    select: { id: true, name: true, groupId: true },
  })
  if (!mine) return NextResponse.json({ branches: [] })

  const rows = await prisma.cargo.findMany({
    where: mine.groupId ? { groupId: mine.groupId } : { id: mine.id },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  const branches = rows
    .filter(b => !q || b.name.toLowerCase().includes(q))
    .slice(0, 8)
    .map(b => ({ id: b.id, name: b.name, current: b.id === mine.id }))

  return NextResponse.json({ branches })
}

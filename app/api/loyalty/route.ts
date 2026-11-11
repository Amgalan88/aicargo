import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized } from '@/lib/auth'
import { customerLoyalty } from '@/lib/loyalty-db'

// GET /api/loyalty — хэрэглэгчийн өөрийн VIP шат, онооны үлдэгдэл, урамшуулалтай баримтууд (өөрийн утас, өөрийн карго)
export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (!user.cargoId) return NextResponse.json(null)
  const me = await prisma.user.findUnique({ where: { id: user.userId }, select: { phone: true, cargoId: true } })
  if (!me || me.cargoId !== user.cargoId) return NextResponse.json(null)
  return NextResponse.json(await customerLoyalty(prisma, user.cargoId, me.phone))
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

// Багц бүртгэлийн хуудсанд төлбөрийн сануулга/хаалт харуулахад — дуусах огноо л буцаана
export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if ((user.role !== 'EREEN' && user.role !== 'ADMIN') || !user.cargoId) return forbidden()
  const cargo = await prisma.cargo.findUnique({ where: { id: user.cargoId }, select: { paidUntil: true } })
  return NextResponse.json({ paidUntil: cargo?.paidUntil ?? null })
}

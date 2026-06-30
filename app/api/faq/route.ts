import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUserFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  // Logged-in user → use their cargoId from JWT
  const authUser = getAuthUserFromRequest(req)
  if (authUser?.cargoId) {
    const faqs = await prisma.faq.findMany({
      where: { cargoId: authUser.cargoId },
      orderBy: { order: 'asc' },
    })
    return NextResponse.json(faqs)
  }

  // Public (landing page) → use query param, default 1
  const cargoIdParam = req.nextUrl.searchParams.get('cargoId')
  const cargoId = cargoIdParam ? Number(cargoIdParam) : 1
  const faqs = await prisma.faq.findMany({
    where: { cargoId },
    orderBy: { order: 'asc' },
  })
  return NextResponse.json(faqs)
}

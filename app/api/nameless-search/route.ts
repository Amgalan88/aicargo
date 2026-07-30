import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized } from '@/lib/auth'

// Эзэн (утас/хэрэглэгч) тодорхойгүйгээр бүртгэгдсэн ачааг трак кодоор хайна —
// хэрэглэгч өөрийн ачааг эзэнгүй жагсаалтаас олоод компанидаа мэдэгдэх боломжтой.
export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (!user.cargoId) return NextResponse.json([])

  const q = req.nextUrl.searchParams.get('q')?.trim().toUpperCase() ?? ''
  if (q.length < 3) return NextResponse.json([])

  const shipments = await prisma.shipment.findMany({
    where: {
      cargoId: user.cargoId,
      userId: null,
      phone: null,
      status: { in: ['EREEN_ARRIVED', 'ARRIVED'] },
      archived: false,
      trackCode: { contains: q },
    },
    select: { id: true, trackCode: true, description: true, status: true, adminPrice: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  })
  return NextResponse.json(shipments)
}

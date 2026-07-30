import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized } from '@/lib/auth'

// Эзэн (утас/хэрэглэгч) тодорхойгүйгээр УБ-д ирсэн ачааг жагсаана/трак кодоор
// хайна — хэрэглэгч өөрийн ачааг эзэнгүй жагсаалтаас олоод компанидаа
// мэдэгдэх боломжтой. Query хоосон бол бүгдийг харуулна.
// EREEN_ARRIVED-ийг оруулаагүй нь санаатай: Эрээнд ирэх үед ихэнх ачаанд
// утас/эзэн байхгүй байх нь энгийн үзэгдэл (эзэнгүй биш, зүгээр хараахан
// холбогдоогүй) тул тэдгээрийг оруулбал жагсаалт хэт их дэмий бүртгэлээр дүүрнэ.
export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (!user.cargoId) return NextResponse.json([])

  const q = req.nextUrl.searchParams.get('q')?.trim().toUpperCase() ?? ''

  const shipments = await prisma.shipment.findMany({
    where: {
      cargoId: user.cargoId,
      userId: null,
      phone: null,
      status: 'ARRIVED',
      archived: false,
      ...(q ? { trackCode: { contains: q } } : {}),
    },
    select: { id: true, trackCode: true, description: true, status: true, adminPrice: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })
  return NextResponse.json(shipments)
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: 'Утас шаардлагатай' }, { status: 400 })

  const target = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, name: true, phone: true, role: true, cargoId: true },
  })

  if (!target) return NextResponse.json({ error: 'Хэрэглэгч олдсонгүй' }, { status: 404 })

  return NextResponse.json(target)
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { pushConfigured } from '@/lib/push'

// Мэдэгдлийн хуудсанд: хэдэн хэрэглэгч push мэдэгдэл асаасныг харуулна.
// Мэдэгдэл автоматаар очдог (Эрээнд ирсэн / Ирсэн, 4 цагт нэг удаа) — гараар илгээх шаардлагагүй.
export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if ((admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') || !admin.cargoId) return forbidden()
  const [subscribers, users] = await Promise.all([
    prisma.user.count({ where: { cargoId: admin.cargoId, role: 'USER', pushSubscriptions: { some: {} } } }),
    prisma.user.count({ where: { cargoId: admin.cargoId, role: 'USER' } }),
  ])
  return NextResponse.json({ subscribers, users, configured: pushConfigured() })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { logAdminAction } from '@/lib/audit'

// Промо хэсгийн эрх: промо горимтой каргын админ уншина; өөрчлөхийг зөвхөн эзэмшигч (ажилтан админ биш)
export async function promoGuard(req: NextRequest, opts: { write?: string } = {}) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return { error: unauthorized() }
  if (admin.role !== 'ADMIN' || !admin.cargoId) return { error: forbidden() }
  const cargoId = admin.cargoId
  const cargo = await prisma.cargo.findUnique({ where: { id: cargoId }, select: { promoEnabled: true } })
  if (!cargo?.promoEnabled) return { error: NextResponse.json({ error: 'Промо код энэ каргод асаагүй байна' }, { status: 403 }) }
  if (opts.write && admin.isStaffAdmin) {
    await logAdminAction(prisma, { cargoId, userId: admin.userId, userName: admin.name, action: 'settings:permission-denied', detail: `оролдсон: ${opts.write}` })
    return { error: NextResponse.json({ error: 'Зөвхөн эзэмшигч админ өөрчилнө' }, { status: 403 }) }
  }
  return { admin, cargoId }
}

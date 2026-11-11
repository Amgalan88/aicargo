import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { adminCustomerDetail } from '@/lib/loyalty-db'
import { parsePhone } from '@/lib/phone'

// GET /api/admin/loyalty/customer?phone=99112233 — VIP, онооны үлдэгдэл, ledger, баримтууд (зөвхөн энэ каргод)
export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  const phone = parsePhone(req.nextUrl.searchParams.get('phone'))
  if (!phone) return NextResponse.json({ error: '8 оронтой утас оруулна уу' }, { status: 400 })
  return NextResponse.json(await adminCustomerDetail(prisma, admin.cargoId!, phone))
}

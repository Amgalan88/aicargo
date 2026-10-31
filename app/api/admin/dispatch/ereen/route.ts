import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { dispatchEnabledFor } from '@/lib/dispatch'

type Row = { id: number; trackCode: string; phone: string | null; name: string | null; ereenArrivedAt: Date | null }

// GET — «Эрээнд ирсэн» төлөвтэй ачаа (сүүлийнх нь эхэнд) — «Ирсэн» бүртгэлийн өмнө тулгах ачаагаа сонгоход
export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' || !admin.cargoId) return forbidden()
  if (!(await dispatchEnabledFor(admin.cargoId))) return forbidden()
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT s.id, s."trackCode", COALESCE(u.phone, s.phone) AS phone, u.name, s."ereenArrivedAt"
    FROM "Shipment" s LEFT JOIN "User" u ON u.id = s."userId"
    WHERE s."cargoId" = ${admin.cargoId} AND s.status = 'EREEN_ARRIVED'
    ORDER BY s."ereenArrivedAt" DESC NULLS LAST, s.id DESC
    LIMIT 3000`
  return NextResponse.json(rows)
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parsePhone } from '@/lib/phone'
import { requestHasBotAccess } from '@/lib/bot-auth'
import { listShipmentsByPhone } from '@/lib/shipment-by-phone'

// Нээлттэй хайлт searchByPhone=false үед 403 хэвээр. Authorization: Bearer BOT_API_KEY
// зөвхөн энэ route-ийн хайлтыг нээнэ — админ cookie, өөр API-д нөлөөлөхгүй.
export async function GET(req: NextRequest) {
  const phoneRaw = req.nextUrl.searchParams.get('phone')?.trim()
  if (!phoneRaw) return NextResponse.json({ error: 'Утас оруулна уу' }, { status: 400 })

  const slug = req.headers.get('x-cargo-slug')
  if (!slug) return NextResponse.json({ error: 'Cargo олдсонгүй' }, { status: 400 })

  const cargo = await (prisma.cargo as any).findUnique({
    where: { slug },
    select: { id: true, searchByPhone: true },
  })
  if (!cargo) return NextResponse.json({ error: 'Cargo олдсонгүй' }, { status: 404 })

  // Буруу эсвэл хоосон Bearer нь нэвтрээгүй хүсэлт: 401 биш, одоогийн 403 / нийтийн хайлт хэвээр.
  const bot = requestHasBotAccess(req.headers.get('authorization'))
  if (!cargo.searchByPhone && !bot) {
    return NextResponse.json({ error: 'Утасаар хайх боломжгүй' }, { status: 403 })
  }

  const phone = parsePhone(phoneRaw)
  if (!phone) {
    if (bot) return NextResponse.json({ error: 'Утасны дугаар 8 оронтой байна' }, { status: 400 })
    return NextResponse.json([])
  }

  const shipments = await listShipmentsByPhone(cargo.id, phone, bot ? 'bot' : 'public')
  return NextResponse.json(shipments)
}

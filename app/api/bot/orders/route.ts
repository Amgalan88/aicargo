import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parsePhone } from '@/lib/phone'
import { parseTrackCode } from '@/lib/track-code'
import { requestHasBotAccess } from '@/lib/bot-auth'
import { parseBotOrderBody } from '@/lib/bot-order'
import { findOrCreateBotCustomer } from '@/lib/bot-customer'
import { registerShipmentForUser } from '@/lib/register-shipment'
import { listShipmentsByPhone } from '@/lib/shipment-by-phone'

// Cargo Supporter чатбот. Authorization: Bearer <BOT_API_KEY>.
// Түлхүүр нь cookie session биш — админ UI болон бусад route энэ толгойг үздэггүй.
// Tenant нь public track-тай адил: proxy host-оос x-cargo-slug тавина (darkhan.aicargo.mn → darkhan).

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

async function cargoIdFromHost(req: NextRequest): Promise<{ cargoId: number } | { error: NextResponse }> {
  const slug = req.headers.get('x-cargo-slug')
  if (!slug) return { error: NextResponse.json({ error: 'Cargo олдсонгүй' }, { status: 400 }) }
  const cargo = await prisma.cargo.findUnique({ where: { slug }, select: { id: true } })
  if (!cargo) return { error: NextResponse.json({ error: 'Cargo олдсонгүй' }, { status: 404 }) }
  return { cargoId: cargo.id }
}

export async function GET(req: NextRequest) {
  if (!requestHasBotAccess(req.headers.get('authorization'))) return unauthorized()

  const phoneRaw = req.nextUrl.searchParams.get('phone')?.trim()
  if (!phoneRaw) return NextResponse.json({ error: 'Утас оруулна уу' }, { status: 400 })
  const phone = parsePhone(phoneRaw)
  if (!phone) return NextResponse.json({ error: 'Утасны дугаар 8 оронтой байна' }, { status: 400 })

  const cargo = await cargoIdFromHost(req)
  if ('error' in cargo) return cargo.error

  const shipments = await listShipmentsByPhone(cargo.cargoId, phone, 'bot')
  return NextResponse.json(shipments)
}

export async function POST(req: NextRequest) {
  if (!requestHasBotAccess(req.headers.get('authorization'))) return unauthorized()

  const parsed = parseBotOrderBody(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const code = parseTrackCode(parsed.value.trackCode)
  if (!code) {
    return NextResponse.json({ error: 'Трак код буруу байна. Латин үсэг, тоогоор оруулна уу' }, { status: 400 })
  }

  const cargo = await cargoIdFromHost(req)
  if ('error' in cargo) return cargo.error

  const customer = await findOrCreateBotCustomer(cargo.cargoId, parsed.value.phone, parsed.value.name)
  if (!customer.ok) return NextResponse.json({ error: customer.error }, { status: customer.status })

  const result = await registerShipmentForUser({
    userId: customer.user.id,
    cargoId: cargo.cargoId,
    phone: customer.user.phone,
    trackCode: code,
    description: parsed.value.note,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ ...result.shipment, name: customer.user.name }, { status: result.status })
}

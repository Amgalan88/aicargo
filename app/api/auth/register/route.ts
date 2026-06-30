import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken, setAuthCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { name, phone, email, password, cargoId } = await req.json()

  if (!name || !phone || !email || !password || !cargoId) {
    return NextResponse.json({ error: 'Бүх талбарыг бөглөнө үү' }, { status: 400 })
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone }, { email }] },
  })
  if (existing) {
    return NextResponse.json({ error: 'Утас эсвэл и-мэйл бүртгэлтэй байна' }, { status: 409 })
  }

  const cargo = await prisma.cargo.findUnique({ where: { id: Number(cargoId) } })
  if (!cargo) {
    return NextResponse.json({ error: 'Карго олдсонгүй' }, { status: 400 })
  }

  const hashed = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { name, phone, email, password: hashed, cargoId: cargo.id },
  })

  // Auto-link any existing shipments with this phone in this cargo
  await prisma.shipment.updateMany({
    where: { phone, userId: null, cargoId: cargo.id },
    data: { userId: user.id },
  })

  const token = signToken({ userId: user.id, role: user.role, cargoId: user.cargoId })
  const res = NextResponse.json({ ok: true })
  setAuthCookie(res, token)
  return res
}

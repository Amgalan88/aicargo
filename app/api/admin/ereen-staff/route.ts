import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

async function requireAdmin(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return { error: unauthorized() }
  if (admin.role !== 'ADMIN') return { error: forbidden() }
  const cargo = await (prisma.cargo as any).findUnique({
    where: { id: admin.cargoId! },
    select: { batchEnabled: true },
  })
  if (!cargo?.batchEnabled) {
    return { error: NextResponse.json({ error: 'Багц бүртгэл идэвхжээгүй байна' }, { status: 403 }) }
  }
  return { admin }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const staff = await prisma.user.findMany({
    where: { cargoId: auth.admin!.cargoId!, role: 'EREEN' as any },
    select: { id: true, name: true, phone: true, createdAt: true },
  })
  return NextResponse.json(staff)
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const { name, phone, password } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Нэр оруулна уу' }, { status: 400 })
  if (!/^\d{8}$/.test(String(phone ?? '').trim())) return NextResponse.json({ error: 'Утасны дугаар 8 оронтой байна' }, { status: 400 })
  if (!password || password.length < 6) return NextResponse.json({ error: 'Нууц үг 6-аас дээш тэмдэгт байна' }, { status: 400 })

  const existing = await prisma.user.findUnique({ where: { phone: String(phone).trim() } })
  if (existing) return NextResponse.json({ error: 'Энэ дугаар бүртгэлтэй байна' }, { status: 409 })

  const staff = await prisma.user.create({
    data: {
      name: name.trim(),
      phone: String(phone).trim(),
      password: await bcrypt.hash(password, 10),
      role: 'EREEN' as any,
      cargoId: auth.admin!.cargoId!,
    },
    select: { id: true, name: true, phone: true },
  })
  return NextResponse.json(staff, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const { id, password } = await req.json()
  if (!id || !password || password.length < 6) {
    return NextResponse.json({ error: 'Нууц үг 6-аас дээш тэмдэгт байна' }, { status: 400 })
  }

  const staff = await prisma.user.findFirst({
    where: { id: Number(id), cargoId: auth.admin!.cargoId!, role: 'EREEN' as any },
  })
  if (!staff) return NextResponse.json({ error: 'Олдсонгүй' }, { status: 404 })

  await prisma.user.update({
    where: { id: staff.id },
    data: {
      password: await bcrypt.hash(password, 10),
      tokenVersion: { increment: 1 }, // хуучин session-уудыг хүчингүй болгоно
    },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const { id } = await req.json()
  const staff = await prisma.user.findFirst({
    where: { id: Number(id), cargoId: auth.admin!.cargoId!, role: 'EREEN' as any },
  })
  if (!staff) return NextResponse.json({ error: 'Олдсонгүй' }, { status: 404 })

  await prisma.user.delete({ where: { id: staff.id } })
  return NextResponse.json({ ok: true })
}

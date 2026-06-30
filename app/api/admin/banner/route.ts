import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') return forbidden()

  const banner = await (prisma.banner as any).findFirst({
    where: { cargoId: admin.cargoId! },
    orderBy: { createdAt: 'desc' },
    select: { id: true, content: true, imageUrl: true, expiresAt: true, createdAt: true },
  })
  return NextResponse.json(banner ?? null)
}

export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') return forbidden()

  const { content, imageUrl, expiresAt } = await req.json()
  if (!content?.trim()) {
    return NextResponse.json({ error: 'Мэдэгдлийн текст хоосон байна' }, { status: 400 })
  }

  // Delete existing banners for this cargo
  await (prisma.banner as any).deleteMany({ where: { cargoId: admin.cargoId! } })

  const banner = await (prisma.banner as any).create({
    data: {
      cargoId: admin.cargoId!,
      content: content.trim(),
      imageUrl: imageUrl || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
    select: { id: true, content: true, imageUrl: true, expiresAt: true, createdAt: true },
  })
  return NextResponse.json(banner, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') return forbidden()

  await (prisma.banner as any).deleteMany({ where: { cargoId: admin.cargoId! } })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { auditLater } from '@/lib/audit'

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
  if (admin.cargoId) {
    const text = content.trim().replace(/\s+/g, ' ')
    auditLater({ cargoId: admin.cargoId, userId: admin.userId, userName: admin.name, action: 'banner:create', detail: text.length > 80 ? text.slice(0, 80) + '…' : text })
  }
  return NextResponse.json(banner, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') return forbidden()

  const { count } = await (prisma.banner as any).deleteMany({ where: { cargoId: admin.cargoId! } })
  if (count && admin.cargoId) auditLater({ cargoId: admin.cargoId, userId: admin.userId, userName: admin.name, action: 'banner:delete' })
  return NextResponse.json({ ok: true })
}

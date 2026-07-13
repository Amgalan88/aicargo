import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const banner = await (prisma.superBanner as any).findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, content: true, imageUrl: true, expiresAt: true, audience: true, createdAt: true },
  })
  return NextResponse.json(banner ?? null)
}

export async function POST(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const { content, imageUrl, expiresAt, audience } = await req.json()
  if (!content?.trim()) {
    return NextResponse.json({ error: 'Мэдэгдлийн текст хоосон байна' }, { status: 400 })
  }
  const aud = ['ADMIN', 'USER', 'ALL'].includes(audience) ? audience : 'ADMIN'

  await (prisma.superBanner as any).deleteMany({})

  const banner = await (prisma.superBanner as any).create({
    data: {
      content: content.trim(),
      imageUrl: imageUrl || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      audience: aud,
    },
    select: { id: true, content: true, imageUrl: true, expiresAt: true, audience: true, createdAt: true },
  })
  return NextResponse.json(banner, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  await (prisma.superBanner as any).deleteMany({})
  return NextResponse.json({ ok: true })
}

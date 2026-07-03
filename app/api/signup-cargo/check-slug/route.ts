import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateSlug } from '@/lib/cargo-signup'

export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get('slug') ?? '').trim().toLowerCase()

  const err = validateSlug(slug)
  if (err) return NextResponse.json({ available: false, error: err })

  const existing = await prisma.cargo.findUnique({ where: { slug }, select: { id: true } })
  if (existing) return NextResponse.json({ available: false, error: 'Энэ subdomain аль хэдийн эзэмшигдсэн байна' })

  return NextResponse.json({ available: true })
}

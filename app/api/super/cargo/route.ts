import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { uploadLogo } from '@/lib/cloudinary'

export async function POST(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const { name, slug, ereemReceiver, ereemPhone, ereemRegion, ereemAddress, logoUrl, adminName, adminPhone, adminPassword } = await req.json()

  if (!name || !slug || !ereemReceiver || !ereemPhone || !ereemAddress) {
    return NextResponse.json({ error: 'Карго мэдээллийг бүрэн бөглөнө үү' }, { status: 400 })
  }
  if (!adminName || !adminPhone || !adminPassword) {
    return NextResponse.json({ error: 'Админы мэдээллийг бүрэн бөглөнө үү' }, { status: 400 })
  }

  const slugClean = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')

  let finalLogoUrl = logoUrl || null
  if (logoUrl?.startsWith('data:')) {
    finalLogoUrl = await uploadLogo(logoUrl, slugClean)
  }

  const existingSlug = await prisma.cargo.findUnique({ where: { slug: slugClean } })
  if (existingSlug) {
    return NextResponse.json({ error: 'Энэ slug аль хэдийн байна' }, { status: 409 })
  }

  const existingPhone = await prisma.user.findUnique({ where: { phone: adminPhone.trim() } })
  if (existingPhone) {
    return NextResponse.json({ error: 'Энэ утасны дугаар бүртгэлтэй байна' }, { status: 409 })
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10)

  // Create cargo + admin user in one transaction
  const cargo = await prisma.cargo.create({
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(finalLogoUrl ? { logoUrl: finalLogoUrl } : {}),
      name: name.trim(),
      slug: slugClean,
      ereemReceiver: ereemReceiver.trim(),
      ereemPhone: ereemPhone.trim(),
      ereemRegion: ereemRegion?.trim() ?? '',
      ereemAddress: ereemAddress.trim(),
      users: {
        create: {
          name: adminName.trim(),
          phone: adminPhone.trim(),
          password: hashedPassword,
          role: 'ADMIN',
        },
      },
    },
    include: { users: { select: { id: true, name: true, phone: true, role: true } } },
  })

  return NextResponse.json(cargo, { status: 201 })
}

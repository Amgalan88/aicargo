import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { uploadBannerImage } from '@/lib/cloudinary'

export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') return forbidden()

  const { base64 } = await req.json()
  if (!base64) return NextResponse.json({ error: 'base64 шаардлагатай' }, { status: 400 })

  const url = await uploadBannerImage(base64, `cargo-${admin.cargoId}-banner`)
  return NextResponse.json({ url })
}

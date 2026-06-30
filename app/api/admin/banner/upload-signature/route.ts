import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import cloudinary from '@/lib/cloudinary'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') return forbidden()

  const timestamp = Math.round(Date.now() / 1000)
  const publicId = `cargo-${admin.cargoId}-banner`
  const folder = 'cargo-banners'

  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, public_id: publicId },
    process.env.CLOUDINARY_API_SECRET!
  )

  return NextResponse.json({
    signature,
    timestamp,
    publicId,
    folder,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
  })
}

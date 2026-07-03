import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function uploadLogo(base64: string, publicId: string): Promise<string> {
  const result = await cloudinary.uploader.upload(base64, {
    public_id: `cargo-logos/${publicId}`,
    overwrite: true,
    transformation: [{ width: 400, height: 400, crop: 'fit', quality: 'auto', fetch_format: 'png' }],
  })
  return result.secure_url
}

export async function uploadBannerImage(base64: string, publicId: string): Promise<string> {
  const result = await cloudinary.uploader.upload(base64, {
    public_id: `cargo-banners/${publicId}`,
    overwrite: true,
    transformation: [{ width: 800, quality: 'auto', fetch_format: 'auto' }],
  })
  return result.secure_url
}

export async function uploadWarehouseImage(base64: string, publicId: string): Promise<string> {
  const result = await cloudinary.uploader.upload(base64, {
    public_id: `partner-warehouses/${publicId}`,
    overwrite: true,
    transformation: [{ width: 800, height: 500, crop: 'fill', quality: 'auto', fetch_format: 'auto' }],
  })
  return result.secure_url
}

export default cloudinary

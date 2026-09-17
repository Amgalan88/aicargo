import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { uploadWarehouseGalleryImage, deleteCloudinaryImage } from '@/lib/cloudinary'
import { isImageCategory, MAX_GALLERY_IMAGES, categoryLabel } from '@/lib/warehouse'
import { logWarehouseAction } from '@/lib/warehouse-log'

type Params = { params: Promise<{ id: string }> }

async function requireSuperWarehouse(req: NextRequest, params: Params['params']) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return { error: unauthorized() }
  if (user.role !== 'SUPER_ADMIN') return { error: forbidden() }
  const warehouseId = Number((await params).id)
  if (!warehouseId) return { error: NextResponse.json({ error: 'ID буруу' }, { status: 400 }) }
  const wh = await prisma.partnerWarehouse.findUnique({ where: { id: warehouseId }, select: { id: true } })
  if (!wh) return { error: NextResponse.json({ error: 'Агуулах олдсонгүй' }, { status: 404 }) }
  return { warehouseId, user }
}

function listImages(warehouseId: number) {
  return prisma.warehouseImage.findMany({
    where: { warehouseId },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  })
}

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireSuperWarehouse(req, params)
  if (auth.error) return auth.error
  return NextResponse.json(await listImages(auth.warehouseId))
}

// Нэг хүсэлтэд нэг зураг — Vercel-ийн 4.5MB body хязгаараас хэтрэхгүйн тулд client дараалан илгээнэ
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireSuperWarehouse(req, params)
  if (auth.error) return auth.error
  const { warehouseId } = auth

  let body: { imageBase64?: string; category?: string; caption?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.imageBase64?.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Зураг буруу байна' }, { status: 400 })
  }
  const category = isImageCategory(body.category) ? body.category : 'GENERAL'

  const count = await prisma.warehouseImage.count({ where: { warehouseId } })
  if (count >= MAX_GALLERY_IMAGES) {
    return NextResponse.json({ error: `Нэг агуулахад хамгийн ихдээ ${MAX_GALLERY_IMAGES} зураг байна` }, { status: 400 })
  }

  let uploaded: { url: string; publicId: string }
  try {
    uploaded = await uploadWarehouseGalleryImage(body.imageBase64, warehouseId)
  } catch {
    return NextResponse.json({ error: 'Зураг байршуулахад алдаа гарлаа' }, { status: 500 })
  }

  const last = await prisma.warehouseImage.findFirst({
    where: { warehouseId },
    orderBy: { order: 'desc' },
    select: { order: true },
  })
  const image = await prisma.warehouseImage.create({
    data: {
      warehouseId,
      url: uploaded.url,
      publicId: uploaded.publicId,
      category,
      caption: body.caption?.trim() || null,
      order: (last?.order ?? -1) + 1,
    },
  })

  // Нүүр зураггүй агуулахад эхний галерейн зургийг нүүр болгоно
  await prisma.partnerWarehouse.updateMany({
    where: { id: warehouseId, imageUrl: null },
    data: { imageUrl: uploaded.url },
  })

  await logWarehouseAction(prisma, {
    warehouseId, userId: auth.user.userId, userName: auth.user.name,
    action: 'IMAGE_ADDED', detail: categoryLabel(category),
  })
  return NextResponse.json(image, { status: 201 })
}

// { id, caption?, category? } — нэг зураг засах
// { order: number[] } — дарааллыг бүхэлд нь шинэчлэх
// { coverId } — нүүр зураг болгох
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireSuperWarehouse(req, params)
  if (auth.error) return auth.error
  const { warehouseId } = auth

  let body: { id?: number; caption?: string; category?: string; order?: number[]; coverId?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (Array.isArray(body.order)) {
    const ids = body.order.map(Number)
    const owned = await prisma.warehouseImage.count({ where: { warehouseId, id: { in: ids } } })
    if (owned !== ids.length || new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: 'Зургийн жагсаалт буруу байна' }, { status: 400 })
    }
    await prisma.$transaction(ids.map((id, i) =>
      prisma.warehouseImage.update({ where: { id }, data: { order: i } })
    ))
    return NextResponse.json(await listImages(warehouseId))
  }

  if (body.coverId) {
    const img = await prisma.warehouseImage.findFirst({
      where: { id: Number(body.coverId), warehouseId },
      select: { url: true },
    })
    if (!img) return NextResponse.json({ error: 'Зураг олдсонгүй' }, { status: 404 })
    await prisma.partnerWarehouse.update({ where: { id: warehouseId }, data: { imageUrl: img.url } })
    return NextResponse.json({ ok: true, imageUrl: img.url })
  }

  const id = Number(body.id)
  if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })
  if (body.category !== undefined && !isImageCategory(body.category)) {
    return NextResponse.json({ error: 'Ангилал буруу байна' }, { status: 400 })
  }

  const result = await prisma.warehouseImage.updateMany({
    where: { id, warehouseId },
    data: {
      ...(body.caption !== undefined ? { caption: body.caption?.trim() || null } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
    },
  })
  if (result.count === 0) return NextResponse.json({ error: 'Зураг олдсонгүй' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireSuperWarehouse(req, params)
  if (auth.error) return auth.error
  const { warehouseId } = auth

  let body: { id?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const img = await prisma.warehouseImage.findFirst({
    where: { id: Number(body.id), warehouseId },
    select: { id: true, url: true, publicId: true, category: true, caption: true },
  })
  if (!img) return NextResponse.json({ error: 'Зураг олдсонгүй' }, { status: 404 })

  await prisma.warehouseImage.delete({ where: { id: img.id } })

  // Устгасан зураг нүүр зураг байсан бол дараагийн зургийг нүүр болгоно
  const wh = await prisma.partnerWarehouse.findUnique({ where: { id: warehouseId }, select: { imageUrl: true } })
  if (wh?.imageUrl === img.url) {
    const next = await prisma.warehouseImage.findFirst({
      where: { warehouseId },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      select: { url: true },
    })
    await prisma.partnerWarehouse.update({ where: { id: warehouseId }, data: { imageUrl: next?.url ?? null } })
  }

  await logWarehouseAction(prisma, {
    warehouseId, userId: auth.user.userId, userName: auth.user.name,
    action: 'IMAGE_DELETED', detail: [categoryLabel(img.category), img.caption].filter(Boolean).join(' · '),
  })

  // Serverless функц хариу буцаамагц зогсдог тул хүлээнэ; Cloudinary алдаа DB устгалтыг буцаахгүй
  try {
    await deleteCloudinaryImage(img.publicId)
  } catch (err) {
    console.error('Cloudinary delete failed:', img.publicId, err)
  }
  return NextResponse.json({ ok: true })
}

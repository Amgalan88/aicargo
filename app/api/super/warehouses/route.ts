import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { uploadWarehouseImage } from '@/lib/cloudinary'

async function requireSuper(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return { error: unauthorized() }
  if (user.role !== 'SUPER_ADMIN') return { error: forbidden() }
  return { user }
}

export async function GET(req: NextRequest) {
  const auth = await requireSuper(req)
  if (auth.error) return auth.error

  const warehouses = await (prisma as any).partnerWarehouse.findMany({
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  })
  return NextResponse.json(warehouses)
}

export async function POST(req: NextRequest) {
  const auth = await requireSuper(req)
  if (auth.error) return auth.error

  const { name, description, phone, wechat, address, imageBase64, order, active } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Нэр оруулна уу' }, { status: 400 })

  let imageUrl: string | null = null
  if (imageBase64) {
    try {
      imageUrl = await uploadWarehouseImage(imageBase64, `wh-${Date.now()}`)
    } catch {
      return NextResponse.json({ error: 'Зураг байршуулахад алдаа гарлаа' }, { status: 500 })
    }
  }

  const warehouse = await (prisma as any).partnerWarehouse.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      phone: phone?.trim() || null,
      wechat: wechat?.trim() || null,
      address: address?.trim() || null,
      imageUrl,
      order: Number(order) || 0,
      active: active !== false,
    },
  })
  return NextResponse.json(warehouse, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuper(req)
  if (auth.error) return auth.error

  const { id, name, description, phone, wechat, address, imageBase64, order, active } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })

  let imageUrl: string | undefined
  if (imageBase64) {
    try {
      imageUrl = await uploadWarehouseImage(imageBase64, `wh-${id}`)
    } catch {
      return NextResponse.json({ error: 'Зураг байршуулахад алдаа гарлаа' }, { status: 500 })
    }
  }

  const warehouse = await (prisma as any).partnerWarehouse.update({
    where: { id: Number(id) },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
      ...(wechat !== undefined ? { wechat: wechat?.trim() || null } : {}),
      ...(address !== undefined ? { address: address?.trim() || null } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(order !== undefined ? { order: Number(order) || 0 } : {}),
      ...(active !== undefined ? { active: active === true } : {}),
    },
  })
  return NextResponse.json(warehouse)
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSuper(req)
  if (auth.error) return auth.error

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })

  await (prisma as any).partnerWarehouse.delete({ where: { id: Number(id) } })
  return NextResponse.json({ ok: true })
}

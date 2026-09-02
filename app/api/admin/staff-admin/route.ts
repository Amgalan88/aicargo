import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { logAdminAction } from '@/lib/audit'

const PERM_LABELS: Record<'canEditBank' | 'canEditAddress' | 'canEditLogo', string> = {
  canEditBank: 'данс',
  canEditAddress: 'хаяг',
  canEditLogo: 'лого',
}

async function requireOwnerAdmin(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return { error: unauthorized() }
  if (admin.role !== 'ADMIN') return { error: forbidden() }
  if (admin.isStaffAdmin) return { error: forbidden() } // ажилтан admin өөр ажилтан admin үүсгэж/удирдаж чадахгүй
  return { admin }
}

export async function GET(req: NextRequest) {
  const auth = await requireOwnerAdmin(req)
  if (auth.error) return auth.error

  const staff = await prisma.user.findMany({
    where: { cargoId: auth.admin!.cargoId!, role: 'ADMIN', isStaffAdmin: true },
    select: { id: true, name: true, phone: true, canEditBank: true, canEditAddress: true, canEditLogo: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(staff)
}

export async function POST(req: NextRequest) {
  const auth = await requireOwnerAdmin(req)
  if (auth.error) return auth.error

  const { name, phone, password, canEditBank, canEditAddress, canEditLogo } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Нэр оруулна уу' }, { status: 400 })
  if (!/^\d{8}$/.test(String(phone ?? '').trim())) return NextResponse.json({ error: 'Утасны дугаар 8 оронтой байна' }, { status: 400 })
  if (!password || password.length < 6) return NextResponse.json({ error: 'Нууц үг 6-аас дээш тэмдэгт байна' }, { status: 400 })

  const existing = await prisma.user.findUnique({ where: { phone: String(phone).trim() } })
  if (existing) return NextResponse.json({ error: 'Энэ дугаар бүртгэлтэй байна' }, { status: 409 })

  const grants = { canEditBank: !!canEditBank, canEditAddress: !!canEditAddress, canEditLogo: !!canEditLogo }

  const staff = await prisma.user.create({
    data: {
      name: name.trim(),
      phone: String(phone).trim(),
      password: await bcrypt.hash(password, 10),
      role: 'ADMIN',
      isStaffAdmin: true,
      cargoId: auth.admin!.cargoId!,
      ...grants,
    },
    select: { id: true, name: true, phone: true, canEditBank: true, canEditAddress: true, canEditLogo: true },
  })

  const grantedList = (Object.keys(grants) as (keyof typeof grants)[]).filter(k => grants[k]).map(k => PERM_LABELS[k])
  await logAdminAction(prisma, {
    cargoId: auth.admin!.cargoId!, userId: auth.admin!.userId, userName: auth.admin!.name,
    action: 'staff-admin:create', detail: `${staff.name} (${staff.phone}) · эрх: ${grantedList.join(', ') || 'байхгүй'}`,
  })
  return NextResponse.json(staff, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireOwnerAdmin(req)
  if (auth.error) return auth.error

  const { id, password, canEditBank, canEditAddress, canEditLogo } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })

  const staff = await prisma.user.findFirst({
    where: { id: Number(id), cargoId: auth.admin!.cargoId!, role: 'ADMIN', isStaffAdmin: true },
  })
  if (!staff) return NextResponse.json({ error: 'Олдсонгүй' }, { status: 404 })

  const data: Record<string, unknown> = {}
  let passwordChanged = false
  if (password !== undefined) {
    if (!password || password.length < 6) return NextResponse.json({ error: 'Нууц үг 6-аас дээш тэмдэгт байна' }, { status: 400 })
    data.password = await bcrypt.hash(password, 10)
    data.tokenVersion = { increment: 1 } // хуучин session-уудыг хүчингүй болгоно
    passwordChanged = true
  }

  const permChanges: string[] = []
  for (const [key, label] of Object.entries(PERM_LABELS) as [keyof typeof PERM_LABELS, string][]) {
    const incoming = { canEditBank, canEditAddress, canEditLogo }[key]
    if (incoming !== undefined && !!incoming !== staff[key]) {
      data[key] = !!incoming
      permChanges.push(`${label}: ${staff[key]}→${!!incoming}`)
    }
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ ok: true })

  await prisma.user.update({ where: { id: staff.id }, data })

  if (passwordChanged) {
    await logAdminAction(prisma, {
      cargoId: auth.admin!.cargoId!, userId: auth.admin!.userId, userName: auth.admin!.name,
      action: 'staff-admin:reset-password', detail: `${staff.name} (${staff.phone})`,
    })
  }
  if (permChanges.length > 0) {
    await logAdminAction(prisma, {
      cargoId: auth.admin!.cargoId!, userId: auth.admin!.userId, userName: auth.admin!.name,
      action: 'staff-admin:permissions', detail: `${staff.name}: ${permChanges.join(' · ')}`,
    })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireOwnerAdmin(req)
  if (auth.error) return auth.error

  const { id } = await req.json()
  const staff = await prisma.user.findFirst({
    where: { id: Number(id), cargoId: auth.admin!.cargoId!, role: 'ADMIN', isStaffAdmin: true },
  })
  if (!staff) return NextResponse.json({ error: 'Олдсонгүй' }, { status: 404 })

  await prisma.user.delete({ where: { id: staff.id } })
  await logAdminAction(prisma, {
    cargoId: auth.admin!.cargoId!, userId: auth.admin!.userId, userName: auth.admin!.name,
    action: 'staff-admin:delete', detail: `${staff.name} (${staff.phone})`,
  })
  return NextResponse.json({ ok: true })
}

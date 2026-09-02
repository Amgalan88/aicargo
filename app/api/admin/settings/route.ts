import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { uploadLogo } from '@/lib/cloudinary'
import { logAdminAction } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const cargo = await (prisma.cargo as any).findUnique({
    where: { id: admin.cargoId! },
    select: { name: true, logoUrl: true, batchEnabled: true, ereemReceiver: true, ereemPhone: true, ereemRegion: true, ereemAddress: true, tariff: true, priceCubic: true, priceWeight: true, priceWeightUnit: true, priceWeightTiers: true, announcement: true, contactInfo: true, bankName: true, bankAccountHolder: true, bankAccountNumber: true, bankTransferNote: true, arrivedLabel: true, ereemLabel: true },
  })
  // Хандаж буй хэрэглэгчийн эрхийн мэдээллийг хамт буцаана — клиент юуг
  // disable хийхээ мэдэх ёстой (утгыг нь биш, зөвхөн засах эрхийг хязгаарлана).
  return NextResponse.json({
    ...cargo,
    isStaffAdmin: admin.isStaffAdmin,
    canEditBank: admin.canEditBank,
    canEditAddress: admin.canEditAddress,
    canEditLogo: admin.canEditLogo,
  })
}

export async function PATCH(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { tariff, priceCubic, priceWeight, priceWeightUnit, priceWeightTiers, announcement, contactInfo, bankName, bankAccountHolder, bankAccountNumber, bankTransferNote, arrivedLabel, ereemLabel, ereemReceiver, ereemPhone, ereemRegion, ereemAddress, logoBase64 } = await req.json()

  // Ажилтан admin-д банк/хаяг/лого засах эрхийг тус тусад нь шалгана — эзэмшигчид үргэлж зөвшөөрнө.
  const allowBank = !admin.isStaffAdmin || admin.canEditBank
  const allowAddress = !admin.isStaffAdmin || admin.canEditAddress
  const allowLogo = !admin.isStaffAdmin || admin.canEditLogo

  const deniedFields: string[] = []
  if (logoBase64 && !allowLogo) deniedFields.push('лого')
  if (!allowAddress && [ereemReceiver, ereemPhone, ereemRegion, ereemAddress].some(v => v !== undefined)) deniedFields.push('Эрээний хаяг')
  if (!allowBank && [bankName, bankAccountHolder, bankAccountNumber, bankTransferNote].some(v => v !== undefined)) deniedFields.push('данс')

  // Үнэ бодогчийн тохиргоо — хоосон бол null, эс бол 0-ээс их тоо байх ёстой
  function parsePrice(v: unknown): number | null | undefined {
    if (v === undefined) return undefined
    if (v === null || v === '') return null
    const n = Number(v)
    return isFinite(n) && n > 0 ? n : null
  }
  const cubic = parsePrice(priceCubic)
  const weight = parsePrice(priceWeight)
  const weightUnit = priceWeightUnit === 't' ? 't' : priceWeightUnit === 'kg' ? 'kg' : undefined

  // Жингийн шатлал: [{min: кг босго, price: тухайн үнэ}] — буруу мөрүүдийг хаяж, босгоор нь эрэмбэлнэ
  let tiers: string | null | undefined = undefined
  if (priceWeightTiers !== undefined) {
    if (!Array.isArray(priceWeightTiers)) {
      tiers = null
    } else {
      const clean = priceWeightTiers
        .map((t: any) => ({ min: Number(t?.min), price: Number(t?.price) }))
        .filter(t => isFinite(t.min) && t.min > 0 && isFinite(t.price) && t.price > 0)
        .sort((a, b) => a.min - b.min)
        .slice(0, 10)
      tiers = clean.length > 0 ? JSON.stringify(clean) : null
    }
  }

  // Лого шинээр оруулсан бол Cloudinary-д байршуулна (зөвшөөрөлгүй бол алгасна)
  let logoUrl: string | undefined
  if (logoBase64 && allowLogo) {
    const current = await prisma.cargo.findUnique({
      where: { id: admin.cargoId! },
      select: { slug: true },
    })
    if (!current) return NextResponse.json({ error: 'Карго олдсонгүй' }, { status: 404 })
    try {
      logoUrl = await uploadLogo(logoBase64, current.slug)
    } catch {
      return NextResponse.json({ error: 'Лого байршуулахад алдаа гарлаа' }, { status: 500 })
    }
  }

  const data: Record<string, unknown> = {
    ...(logoUrl ? { logoUrl } : {}),
    ...(allowAddress && ereemReceiver !== undefined ? { ereemReceiver: String(ereemReceiver).trim() } : {}),
    ...(allowAddress && ereemPhone !== undefined ? { ereemPhone: String(ereemPhone).trim() } : {}),
    ...(allowAddress && ereemRegion !== undefined ? { ereemRegion: String(ereemRegion).trim() } : {}),
    ...(allowAddress && ereemAddress !== undefined ? { ereemAddress: String(ereemAddress).trim() } : {}),
    ...(tariff !== undefined ? { tariff: tariff || null } : {}),
    ...(cubic !== undefined ? { priceCubic: cubic } : {}),
    ...(weight !== undefined ? { priceWeight: weight } : {}),
    ...(weightUnit !== undefined ? { priceWeightUnit: weightUnit } : {}),
    ...(tiers !== undefined ? { priceWeightTiers: tiers } : {}),
    ...(announcement !== undefined ? { announcement: announcement || null } : {}),
    ...(contactInfo !== undefined ? { contactInfo: contactInfo || null } : {}),
    ...(allowBank && bankName !== undefined ? { bankName: bankName || null } : {}),
    ...(allowBank && bankAccountHolder !== undefined ? { bankAccountHolder: bankAccountHolder || null } : {}),
    ...(allowBank && bankAccountNumber !== undefined ? { bankAccountNumber: bankAccountNumber || null } : {}),
    ...(allowBank && bankTransferNote !== undefined ? { bankTransferNote: bankTransferNote || null } : {}),
    ...(arrivedLabel !== undefined ? { arrivedLabel: arrivedLabel || null } : {}),
    ...(ereemLabel !== undefined ? { ereemLabel: ereemLabel || null } : {}),
  }

  const cargo = await (prisma.cargo as any).update({ where: { id: admin.cargoId! }, data })

  if (Object.keys(data).length > 0) {
    await logAdminAction(prisma, {
      cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name,
      action: 'settings:update', detail: Object.keys(data).join(', '),
    })
  }
  if (deniedFields.length > 0) {
    await logAdminAction(prisma, {
      cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name,
      action: 'settings:permission-denied', detail: `оролдсон: ${deniedFields.join(', ')}`,
    })
  }
  return NextResponse.json(cargo)
}

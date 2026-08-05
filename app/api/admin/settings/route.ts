import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { uploadLogo } from '@/lib/cloudinary'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const cargo = await (prisma.cargo as any).findUnique({
    where: { id: admin.cargoId! },
    select: { name: true, logoUrl: true, batchEnabled: true, ereemReceiver: true, ereemPhone: true, ereemRegion: true, ereemAddress: true, tariff: true, priceCubic: true, priceWeight: true, priceWeightUnit: true, priceWeightTiers: true, announcement: true, contactInfo: true, bankName: true, bankAccountHolder: true, bankAccountNumber: true, bankTransferNote: true, arrivedLabel: true, ereemLabel: true },
  })
  return NextResponse.json(cargo)
}

export async function PATCH(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { tariff, priceCubic, priceWeight, priceWeightUnit, priceWeightTiers, announcement, contactInfo, bankName, bankAccountHolder, bankAccountNumber, bankTransferNote, arrivedLabel, ereemLabel, ereemReceiver, ereemPhone, ereemRegion, ereemAddress, logoBase64 } = await req.json()

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

  // Лого шинээр оруулсан бол Cloudinary-д байршуулна
  let logoUrl: string | undefined
  if (logoBase64) {
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

  const cargo = await (prisma.cargo as any).update({
    where: { id: admin.cargoId! },
    data: {
      ...(logoUrl ? { logoUrl } : {}),
      ...(ereemReceiver !== undefined ? { ereemReceiver: String(ereemReceiver).trim() } : {}),
      ...(ereemPhone !== undefined ? { ereemPhone: String(ereemPhone).trim() } : {}),
      ...(ereemRegion !== undefined ? { ereemRegion: String(ereemRegion).trim() } : {}),
      ...(ereemAddress !== undefined ? { ereemAddress: String(ereemAddress).trim() } : {}),
      ...(tariff !== undefined ? { tariff: tariff || null } : {}),
      ...(cubic !== undefined ? { priceCubic: cubic } : {}),
      ...(weight !== undefined ? { priceWeight: weight } : {}),
      ...(weightUnit !== undefined ? { priceWeightUnit: weightUnit } : {}),
      ...(tiers !== undefined ? { priceWeightTiers: tiers } : {}),
      ...(announcement !== undefined ? { announcement: announcement || null } : {}),
      ...(contactInfo !== undefined ? { contactInfo: contactInfo || null } : {}),
      ...(bankName !== undefined ? { bankName: bankName || null } : {}),
      ...(bankAccountHolder !== undefined ? { bankAccountHolder: bankAccountHolder || null } : {}),
      ...(bankAccountNumber !== undefined ? { bankAccountNumber: bankAccountNumber || null } : {}),
      ...(bankTransferNote !== undefined ? { bankTransferNote: bankTransferNote || null } : {}),
      ...(arrivedLabel !== undefined ? { arrivedLabel: arrivedLabel || null } : {}),
      ...(ereemLabel !== undefined ? { ereemLabel: ereemLabel || null } : {}),
    },
  })
  return NextResponse.json(cargo)
}

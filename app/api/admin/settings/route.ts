import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { uploadLogo } from '@/lib/cloudinary'
import { logAdminAction } from '@/lib/audit'
import { sanitizeExtraAddresses } from '@/lib/ereen-address'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const cargo = await (prisma.cargo as any).findUnique({
    where: { id: admin.cargoId! },
    select: { name: true, logoUrl: true, batchEnabled: true, ereemReceiver: true, ereemPhone: true, ereemRegion: true, ereemAddress: true, ereemTitle: true, ereemAddresses: true, tariff: true, priceCubic: true, priceWeight: true, priceWeightUnit: true, priceWeightTiers: true, announcement: true, contactInfo: true, bankName: true, bankAccountHolder: true, bankAccountNumber: true, bankTransferNote: true, arrivedLabel: true, ereemLabel: true, linkOrdersEnabled: true, dispatchEnabled: true },
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

  const { tariff, priceCubic, priceWeight, priceWeightUnit, priceWeightTiers, announcement, contactInfo, bankName, bankAccountHolder, bankAccountNumber, bankTransferNote, arrivedLabel, ereemLabel, ereemReceiver, ereemPhone, ereemRegion, ereemAddress, ereemTitle, ereemAddresses, linkOrdersEnabled, dispatchEnabled, logoBase64 } = await req.json()

  // Ажилтан admin-д банк/хаяг/лого засах эрхийг тус тусад нь шалгана — эзэмшигчид үргэлж зөвшөөрнө.
  const allowBank = !admin.isStaffAdmin || admin.canEditBank
  const allowAddress = !admin.isStaffAdmin || admin.canEditAddress
  const allowLogo = !admin.isStaffAdmin || admin.canEditLogo

  const deniedFields: string[] = []
  if (logoBase64 && !allowLogo) deniedFields.push('лого')
  if (!allowAddress && [ereemReceiver, ereemPhone, ereemRegion, ereemAddress, ereemTitle, ereemAddresses].some(v => v !== undefined)) deniedFields.push('Эрээний хаяг')

  // Нэмэлт Эрээний хаягууд (жш: бөөн ачааны хаяг) — нэр, хүлээн авагч, хаяг заавал
  const extra = allowAddress && ereemAddresses !== undefined ? sanitizeExtraAddresses(ereemAddresses) : null
  if (extra?.error) return NextResponse.json({ error: extra.error }, { status: 400 })
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
      select: { id: true },
    })
    if (!current) return NextResponse.json({ error: 'Карго олдсонгүй' }, { status: 404 })
    try {
      // Каргоны id-аар — slug солигдох, чөлөөлөгдсөн нэрийг өөр карго авах үед логог дарж бичихгүй
      logoUrl = await uploadLogo(logoBase64, `cargo-${current.id}`)
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
    ...(allowAddress && ereemTitle !== undefined ? { ereemTitle: String(ereemTitle ?? '').trim().slice(0, 40) || null } : {}),
    ...(extra ? { ereemAddresses: extra.value } : {}),
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
    // Линкээр захиалга авах эсэхийг зөвхөн эзэмшигч шийднэ
    ...(!admin.isStaffAdmin && typeof linkOrdersEnabled === 'boolean' ? { linkOrdersEnabled } : {}),
    // «Ирсэн»-ийг Эрээнээс сонгосонтой тулгах — эзэмшигч асаана/унтраана
    ...(!admin.isStaffAdmin && typeof dispatchEnabled === 'boolean' ? { dispatchEnabled } : {}),
  }

  // Өөрчлөлтийн өмнөх утга — аудитад юу өөрчлөгдсөнийг л бичнэ
  const keys = Object.keys(data)
  const prev = keys.length
    ? await (prisma.cargo as any).findUnique({ where: { id: admin.cargoId! }, select: Object.fromEntries(keys.map(k => [k, true])) })
    : null

  const cargo = await (prisma.cargo as any).update({ where: { id: admin.cargoId! }, data })

  const changed = describeSettingsChanges(prev ?? {}, cargo)
  if (changed) {
    await logAdminAction(prisma, {
      cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name,
      action: 'settings:update', detail: changed,
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

// Тохиргооны талбарын монгол нэр. VALUE_FIELDS-ийн утгыг хуучин → шинэ гэж харуулна (данс, үнэ, шошго)
const FIELD_LABELS: Record<string, string> = {
  logoUrl: 'Лого', ereemReceiver: 'Эрээний хүлээн авагч', ereemPhone: 'Эрээний утас', ereemRegion: 'Эрээний бүс',
  ereemAddress: 'Эрээний хаяг', ereemTitle: 'Хаягийн нэр', ereemAddresses: 'Нэмэлт хаягууд', tariff: 'Тариф',
  priceCubic: 'Кубын үнэ', priceWeight: 'Жингийн үнэ', priceWeightUnit: 'Жингийн нэгж', priceWeightTiers: 'Шатлалтай үнэ',
  announcement: 'Анхааруулга', contactInfo: 'Холбоо барих', bankName: 'Банк', bankAccountHolder: 'Данс эзэмшигч',
  bankAccountNumber: 'Дансны дугаар', bankTransferNote: 'Гүйлгээний утга', arrivedLabel: '"Ирсэн" нэр',
  ereemLabel: '"Эрээнд ирсэн" нэр', linkOrdersEnabled: 'Линк захиалга', phoneVerify: 'Утас баталгаажуулалт', dispatchEnabled: 'Тулгалт',
}
const VALUE_FIELDS = new Set(['bankName', 'bankAccountHolder', 'bankAccountNumber', 'priceCubic', 'priceWeight', 'priceWeightUnit', 'arrivedLabel', 'ereemLabel', 'linkOrdersEnabled', 'phoneVerify', 'dispatchEnabled', 'ereemPhone'])

function norm(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'object' && v !== null && 'toString' in v && !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype) return String(Number(v))
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}
function show(k: string, v: string): string {
  if (k === 'linkOrdersEnabled' || k === 'phoneVerify' || k === 'dispatchEnabled') return v === 'true' ? 'асаасан' : 'унтраасан'
  if (!v) return '(хоосон)'
  return v.length > 40 ? v.slice(0, 40) + '…' : v
}
function describeSettingsChanges(prev: Record<string, unknown>, next: Record<string, unknown>): string {
  const out: string[] = []
  for (const k of Object.keys(prev)) {
    const a = norm(prev[k]), b = norm(next[k])
    if (a === b) continue
    const label = FIELD_LABELS[k] ?? k
    out.push(VALUE_FIELDS.has(k) ? `${label}: ${show(k, a)} → ${show(k, b)}` : label)
  }
  return out.join('; ')
}

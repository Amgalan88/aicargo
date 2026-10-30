import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { uploadLogo } from '@/lib/cloudinary'
import { sanitizeExtraAddresses } from '@/lib/ereen-address'
import { isBrandTheme } from '@/lib/brand-theme'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const { id } = await params
  const cargoId = Number(id)
  if (!cargoId) return NextResponse.json({ error: 'ID буруу' }, { status: 400 })

  const { name, slug, ereemReceiver, ereemPhone, ereemRegion, ereemAddress, logoUrl,
    bankName, bankAccountHolder, bankAccountNumber, bankTransferNote, notificationsEnabled, searchByPhone, paidUntil, batchEnabled, aiEnabled, ereemTitle, ereemAddresses, brandTheme, phoneVerify } = await req.json()

  // Нэмэлт Эрээний хаягууд — нэр, хүлээн авагч, хаяг заавал
  const extra = ereemAddresses !== undefined ? sanitizeExtraAddresses(ereemAddresses) : null
  if (extra?.error) return NextResponse.json({ error: extra.error }, { status: 400 })

  let finalLogoUrl = logoUrl
  if (logoUrl?.startsWith('data:')) {
    finalLogoUrl = await uploadLogo(logoUrl, `cargo-${cargoId}`)
  }

  const cargo = await (prisma.cargo.update as any)({
    where: { id: cargoId },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(slug ? { slug: slug.trim().toLowerCase() } : {}),
      ...(ereemReceiver !== undefined ? { ereemReceiver: ereemReceiver.trim() } : {}),
      ...(ereemPhone !== undefined ? { ereemPhone: ereemPhone.trim() } : {}),
      ...(ereemRegion !== undefined ? { ereemRegion: ereemRegion.trim() } : {}),
      ...(ereemAddress !== undefined ? { ereemAddress: ereemAddress.trim() } : {}),
      ...(finalLogoUrl !== undefined ? { logoUrl: finalLogoUrl || null } : {}),
      ...(bankName !== undefined ? { bankName: bankName?.trim() || null } : {}),
      ...(bankAccountHolder !== undefined ? { bankAccountHolder: bankAccountHolder?.trim() || null } : {}),
      ...(bankAccountNumber !== undefined ? { bankAccountNumber: bankAccountNumber?.trim() || null } : {}),
      ...(bankTransferNote !== undefined ? { bankTransferNote: bankTransferNote?.trim() || null } : {}),
      ...(notificationsEnabled !== undefined ? { notificationsEnabled: Boolean(notificationsEnabled) } : {}),
      ...(searchByPhone !== undefined ? { searchByPhone: Boolean(searchByPhone) } : {}),
      ...(batchEnabled !== undefined ? { batchEnabled: Boolean(batchEnabled) } : {}),
      ...(aiEnabled !== undefined ? { aiEnabled: Boolean(aiEnabled) } : {}),
      // Брэндбүүкийн загвар — зөвхөн мэдэгдэж буй утга (lib/brand-theme), бусад нь null
      ...(brandTheme !== undefined ? { brandTheme: isBrandTheme(brandTheme) ? brandTheme : null } : {}),
      // Сэжигтэй (спам) карго: админ нь жинхэнэ утсаа SMS-ээр баталгаажуулах хүртэл админ хэсэг хаалттай
      ...(phoneVerify !== undefined ? { phoneVerify: Boolean(phoneVerify) } : {}),
      ...(paidUntil !== undefined ? { paidUntil: paidUntil ? new Date(paidUntil) : null } : {}),
      ...(ereemTitle !== undefined ? { ereemTitle: String(ereemTitle ?? '').trim().slice(0, 40) || null } : {}),
      ...(extra ? { ereemAddresses: extra.value } : {}),
    },
  })

  return NextResponse.json(cargo)
}

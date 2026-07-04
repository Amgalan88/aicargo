import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { uploadLogo } from '@/lib/cloudinary'

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
    bankName, bankAccountHolder, bankAccountNumber, bankTransferNote, notificationsEnabled, searchByPhone, paidUntil, batchEnabled } = await req.json()

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
      ...(paidUntil !== undefined ? { paidUntil: paidUntil ? new Date(paidUntil) : null } : {}),
    },
  })

  return NextResponse.json(cargo)
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const cargo = await (prisma.cargo as any).findUnique({
    where: { id: admin.cargoId! },
    select: { name: true, ereemReceiver: true, ereemPhone: true, ereemRegion: true, ereemAddress: true, tariff: true, announcement: true, contactInfo: true, bankName: true, bankAccountHolder: true, bankAccountNumber: true, bankTransferNote: true, arrivedLabel: true, ereemLabel: true },
  })
  return NextResponse.json(cargo)
}

export async function PATCH(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const { tariff, announcement, contactInfo, bankName, bankAccountHolder, bankAccountNumber, bankTransferNote, arrivedLabel, ereemLabel } = await req.json()

  const cargo = await (prisma.cargo as any).update({
    where: { id: admin.cargoId! },
    data: {
      ...(tariff !== undefined ? { tariff: tariff || null } : {}),
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

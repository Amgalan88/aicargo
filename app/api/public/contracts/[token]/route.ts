import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { bad } from '@/lib/contract-auth'
import { ACCESS_TOKEN_RE } from '@/lib/contract-server'
import { PartyAccess, getContractView, patchValues, deleteDraft, partyAction } from '@/lib/contract-actions'

type Params = { params: Promise<{ token: string }> }

// Нууц холбоос нь нэвтрэлтийг орлоно — зөвхөн бүртгэлгүй (cargoId-гүй) гэрээнд хүчинтэй
async function access(params: Params['params']) {
  const { token } = await params
  if (!ACCESS_TOKEN_RE.test(token)) return { error: bad('Гэрээ олдсонгүй', 404) }
  const c = await prisma.warehouseContract.findFirst({
    where: { accessToken: token, cargoId: null },
    select: { guestEmail: true, cargoSignerName: true },
  })
  if (!c?.guestEmail) return { error: bad('Гэрээ олдсонгүй', 404) }
  const a: PartyAccess = {
    where: { accessToken: token, cargoId: null },
    actor: { id: null, name: c.cargoSignerName ?? c.guestEmail },
    canManage: true,
    email: c.guestEmail,
    signerName: c.cargoSignerName ?? '',
    guest: true,
  }
  return { access: a }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const r = await access(params)
  return r.error ?? getContractView(r.access)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const r = await access(params)
  return r.error ?? patchValues(req, r.access)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const r = await access(params)
  return r.error ?? deleteDraft(r.access)
}

export async function POST(req: NextRequest, { params }: Params) {
  const r = await access(params)
  return r.error ?? partyAction(req, r.access)
}

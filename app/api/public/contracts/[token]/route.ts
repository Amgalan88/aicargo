import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { bad } from '@/lib/contract-auth'
import { ACCESS_TOKEN_RE } from '@/lib/contract-server'
import { PartyAccess, getContractView, partyAction } from '@/lib/contract-actions'

type Params = { params: Promise<{ token: string }> }

// Гэрээний нууц холбоос нь хандах эрх — хэн ч (карго нээсэн эсэхээс үл хамааран) нэг л хуудсаар гэрээгээ удирдана
async function access(params: Params['params']) {
  const { token } = await params
  if (!ACCESS_TOKEN_RE.test(token)) return { error: bad('Гэрээ олдсонгүй', 404) }
  const c = await prisma.warehouseContract.findUnique({
    where: { accessToken: token },
    select: { guestEmail: true, cargoSignerName: true },
  })
  if (!c) return { error: bad('Гэрээ олдсонгүй', 404) }
  const a: PartyAccess = {
    where: { accessToken: token },
    actor: { id: null, name: c.cargoSignerName ?? c.guestEmail ?? 'Б тал' },
    canManage: true,
    email: c.guestEmail,
    signerName: c.cargoSignerName ?? '',
    viaLink: true,
  }
  return { access: a }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const r = await access(params)
  return r.error ?? getContractView(r.access)
}

export async function POST(req: NextRequest, { params }: Params) {
  const r = await access(params)
  return r.error ?? partyAction(req, r.access)
}

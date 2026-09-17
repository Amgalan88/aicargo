import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCargoAdmin } from '@/lib/contract-auth'
import { PartyAccess, getContractView, patchValues, deleteDraft, partyAction } from '@/lib/contract-actions'

type Params = { params: Promise<{ id: string }> }

async function access(req: NextRequest, params: Params['params'], manage: boolean) {
  const auth = await requireCargoAdmin(req, manage)
  if (auth.error) return { error: auth.error }
  const { user } = auth
  const me = await prisma.user.findUnique({ where: { id: user.userId }, select: { email: true, name: true } })
  const a: PartyAccess = {
    where: { id: Number((await params).id) || -1, cargoId: user.cargoId },
    actor: { id: user.userId, name: user.name },
    canManage: !user.isStaffAdmin,
    email: me?.email ?? null,
    signerName: me?.name ?? user.name,
    guest: false,
  }
  return { access: a }
}

export async function GET(req: NextRequest, { params }: Params) {
  const r = await access(req, params, false)
  return r.error ?? getContractView(r.access)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const r = await access(req, params, true)
  return r.error ?? patchValues(req, r.access)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const r = await access(req, params, true)
  return r.error ?? deleteDraft(r.access)
}

export async function POST(req: NextRequest, { params }: Params) {
  const r = await access(req, params, true)
  return r.error ?? partyAction(req, r.access)
}

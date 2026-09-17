import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedUserFromRequest, unauthorized, forbidden, VerifiedUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DEMO_SLUG } from '@/lib/demo-seed'

type CargoAdmin = VerifiedUser & { cargoId: number }

// Каргогийн админ. manage=true бол staff admin (зөвхөн харах эрхтэй) хориглогдоно
export async function requireCargoAdmin(req: NextRequest, manage: boolean): Promise<{ user: CargoAdmin; error?: never } | { error: NextResponse; user?: never }> {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return { error: unauthorized() }
  if (user.role !== 'ADMIN' || !user.cargoId) return { error: forbidden() }
  if (manage && user.isStaffAdmin) {
    return { error: NextResponse.json({ error: 'Гэрээтэй холбоотой үйлдлийг зөвхөн каргогийн эзэмшигч хийнэ' }, { status: 403 }) }
  }
  // Демо каргогийн нууц үг нийтэд ил тул бодит агуулахтай гэрээ байгуулахыг хаана
  if (manage) {
    const cargo = await prisma.cargo.findUnique({ where: { id: user.cargoId }, select: { slug: true } })
    if (cargo?.slug === DEMO_SLUG) {
      return { error: NextResponse.json({ error: 'Демо каргогоор гэрээ байгуулах боломжгүй' }, { status: 403 }) }
    }
  }
  return { user: user as CargoAdmin }
}

export async function requireSuperAdmin(req: NextRequest): Promise<{ user: VerifiedUser; error?: never } | { error: NextResponse; user?: never }> {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return { error: unauthorized() }
  if (user.role !== 'SUPER_ADMIN') return { error: forbidden() }
  return { user }
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return await req.json() as T
  } catch {
    return null
  }
}

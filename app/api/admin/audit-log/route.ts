import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { ROUTINE_ACTIONS } from '@/lib/audit-actions'

const PAGE_SIZE = 40

// GET /api/admin/audit-log?scope=important|routine|all&user=<id>&q=<трак/утас>&page=N
// Зөвхөн каргогийн эзэмшигч харна. Хэн (эзэмшигч / ажилтан) юу хийснийг ялгаж харуулна.
export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()
  if (admin.isStaffAdmin) return forbidden() // аудит логийг зөвхөн эзэмшигч харна
  const cargoId = admin.cargoId!

  const sp = req.nextUrl.searchParams
  const page = Math.max(1, Number(sp.get('page') || '1'))
  const scope = sp.get('scope') === 'routine' ? 'routine' : sp.get('scope') === 'all' ? 'all' : 'important'
  const userId = Number(sp.get('user')) || null
  const q = sp.get('q')?.trim().slice(0, 60) || ''

  const where: Prisma.AdminAuditLogWhereInput = {
    cargoId,
    ...(scope === 'important' ? { action: { notIn: ROUTINE_ACTIONS } } : scope === 'routine' ? { action: { in: ROUTINE_ACTIONS } } : {}),
    ...(userId ? { userId } : {}),
    ...(q ? { detail: { contains: q, mode: 'insensitive' } } : {}),
  }

  const [total, items, people] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, userId: true, userName: true, action: true, detail: true, createdAt: true },
    }),
    // Шүүлтүүрт: энэ каргод үйлдэл хийсэн хүмүүс (хамгийн сүүлийн нэрээр)
    prisma.adminAuditLog.groupBy({ by: ['userId', 'userName'], where: { cargoId }, _max: { createdAt: true }, _count: { _all: true } }),
  ])

  // Хүн бүр эзэмшигч үү, ажилтан уу
  const ids = [...new Set(people.map(p => p.userId))]
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true, isStaffAdmin: true } })
  const roleOf = new Map(users.map(u => [u.id,
    u.role === 'SUPER_ADMIN' ? 'system' : u.role === 'USER' ? 'customer' : u.role === 'EREEN' ? 'ereen' : u.isStaffAdmin ? 'staff' : 'owner']))
  const byUser = new Map<number, { userId: number; name: string; role: string; count: number; last: number }>()
  for (const p of people) {
    const last = p._max.createdAt?.getTime() ?? 0
    const cur = byUser.get(p.userId)
    if (!cur) byUser.set(p.userId, { userId: p.userId, name: p.userName, role: roleOf.get(p.userId) ?? 'removed', count: p._count._all, last })
    else { cur.count += p._count._all; if (last > cur.last) { cur.last = last; cur.name = p.userName } }
  }

  return NextResponse.json({
    items: items.map(i => ({ ...i, role: roleOf.get(i.userId) ?? 'removed', me: i.userId === admin.userId })),
    total,
    page,
    pageSize: PAGE_SIZE,
    people: [...byUser.values()]
      .sort((a, b) => (a.userId === admin.userId ? -1 : b.userId === admin.userId ? 1 : b.count - a.count))
      .map(p => ({ userId: p.userId, name: p.name, role: p.role, me: p.userId === admin.userId })),
  })
}

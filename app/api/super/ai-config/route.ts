import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const config = await (prisma as any).aiConfig.findUnique({ where: { id: 1 } })
  return NextResponse.json({
    userPrompt: config?.userPrompt ?? '',
    adminPrompt: config?.adminPrompt ?? '',
  })
}

export async function PATCH(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'SUPER_ADMIN') return forbidden()

  const { userPrompt, adminPrompt } = await req.json()

  const config = await (prisma as any).aiConfig.upsert({
    where: { id: 1 },
    update: {
      ...(userPrompt !== undefined ? { userPrompt: userPrompt?.trim() ?? '' } : {}),
      ...(adminPrompt !== undefined ? { adminPrompt: adminPrompt?.trim() ?? '' } : {}),
    },
    create: {
      id: 1,
      userPrompt: userPrompt?.trim() ?? '',
      adminPrompt: adminPrompt?.trim() ?? '',
    },
  })

  return NextResponse.json({ userPrompt: config.userPrompt, adminPrompt: config.adminPrompt })
}

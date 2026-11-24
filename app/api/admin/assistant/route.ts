// Админы туслахын бэлэн асуултууд (AI-гүй): GET /api/admin/assistant?q=today|waiting|top
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { ASSISTANT_QUESTIONS, answerQuestion, type AssistantQuestion } from '@/lib/assistant'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' || !admin.cargoId) return forbidden()

  const q = req.nextUrl.searchParams.get('q') as AssistantQuestion | null
  if (!q || !ASSISTANT_QUESTIONS.includes(q)) return NextResponse.json({ error: 'Асуулт олдсонгүй' }, { status: 400 })

  const cargo = await prisma.cargo.findUnique({ where: { id: admin.cargoId }, select: { assistantEnabled: true } })
  if (!cargo?.assistantEnabled) return NextResponse.json({ error: 'Туслах унтраалттай байна' }, { status: 403 })

  try {
    return NextResponse.json(await answerQuestion(prisma, admin.cargoId, q))
  } catch (e) {
    console.error('[assistant]', q, e)
    return NextResponse.json({ error: 'Тоо гаргахад алдаа гарлаа. Дахин оролдоно уу.' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

async function requireSuper(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return { error: unauthorized() }
  if (user.role !== 'SUPER_ADMIN') return { error: forbidden() }
  return { user }
}

export async function GET(req: NextRequest) {
  const auth = await requireSuper(req)
  if (auth.error) return auth.error

  const items = await (prisma as any).aiTraining.findMany({
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  })
  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  const auth = await requireSuper(req)
  if (auth.error) return auth.error

  const { question, answer, order } = await req.json()
  if (!question?.trim() || !answer?.trim()) {
    return NextResponse.json({ error: 'Асуулт болон хариулт хоёулаа шаардлагатай' }, { status: 400 })
  }

  const item = await (prisma as any).aiTraining.create({
    data: {
      question: question.trim(),
      answer: answer.trim(),
      order: Number(order) || 0,
    },
  })
  return NextResponse.json(item, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuper(req)
  if (auth.error) return auth.error

  const { id, question, answer, order, active } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })

  const item = await (prisma as any).aiTraining.update({
    where: { id: Number(id) },
    data: {
      ...(question !== undefined ? { question: String(question).trim() } : {}),
      ...(answer !== undefined ? { answer: String(answer).trim() } : {}),
      ...(order !== undefined ? { order: Number(order) || 0 } : {}),
      ...(active !== undefined ? { active: active === true } : {}),
    },
  })
  return NextResponse.json(item)
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSuper(req)
  if (auth.error) return auth.error

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })

  await (prisma as any).aiTraining.delete({ where: { id: Number(id) } })
  return NextResponse.json({ ok: true })
}

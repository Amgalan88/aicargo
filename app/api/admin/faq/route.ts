import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  const faqs = await prisma.faq.findMany({
    where: { cargoId: admin.cargoId! },
    orderBy: { order: 'asc' },
  })
  return NextResponse.json(faqs)
}

export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  try {
    const { question, answer, order } = await req.json()
    if (!question?.trim() || !answer?.trim()) {
      return NextResponse.json({ error: 'Асуулт болон хариулт шаардлагатай' }, { status: 400 })
    }

    const last = await prisma.faq.findFirst({
      where: { cargoId: admin.cargoId! },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    const faq = await prisma.faq.create({
      data: {
        question: question.trim(),
        answer: answer.trim(),
        order: order ?? (last?.order ?? 0) + 1,
        cargoId: admin.cargoId!,
      },
    })
    return NextResponse.json(faq, { status: 201 })
  } catch (e: any) {
    console.error('FAQ POST error:', e)
    return NextResponse.json({ error: e?.message ?? 'Серверийн алдаа' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN') return forbidden()

  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'ID шаардлагатай' }, { status: 400 })

    await prisma.faq.delete({ where: { id: Number(id), cargoId: admin.cargoId! } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('FAQ DELETE error:', e)
    return NextResponse.json({ error: e?.message ?? 'Серверийн алдаа' }, { status: 500 })
  }
}

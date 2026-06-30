import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, code } = await req.json()

  if (!email || !code) {
    return NextResponse.json({ error: 'И-мэйл болон кодоо оруулна уу' }, { status: 400 })
  }

  const otp = await prisma.otp.findFirst({
    where: { email, code, used: false },
    orderBy: { id: 'desc' },
  })

  if (!otp) {
    return NextResponse.json({ error: 'Код буруу байна' }, { status: 400 })
  }

  if (otp.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Кодны хугацаа дууссан байна' }, { status: 400 })
  }

  await prisma.otp.update({ where: { id: otp.id }, data: { used: true } })

  const resetToken = signToken({ userId: 0, role: 'USER', cargoId: null }, '15m')
  // Store email in a short-lived way via token — we use a separate JWT with email claim
  const { sign } = await import('jsonwebtoken')
  const token = sign({ email }, process.env.JWT_SECRET!, { expiresIn: '15m' })

  return NextResponse.json({ resetToken: token })
}

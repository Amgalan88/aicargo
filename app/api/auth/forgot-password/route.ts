import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendOtpEmail } from '@/lib/mail'

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email) {
    return NextResponse.json({ error: 'И-мэйл оруулна уу' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email } })
  // Don't reveal if user exists or not
  if (!user) {
    return NextResponse.json({ ok: true })
  }

  // Invalidate old OTPs
  await prisma.otp.updateMany({
    where: { email, used: false },
    data: { used: true },
  })

  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 min

  await prisma.otp.create({ data: { email, code, expiresAt } })

  try {
    await sendOtpEmail(email, code)
  } catch {
    return NextResponse.json({ error: 'И-мэйл илгээхэд алдаа гарлаа' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

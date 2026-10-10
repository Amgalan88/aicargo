import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendOtpEmail } from '@/lib/mail'
import { normEmail, findUserByEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  // Том/жижиг үсэг, зай үл хамааран (утасны гар эхний үсгийг томруулдаг)
  const email = normEmail(body.email)

  if (!email) {
    return NextResponse.json({ error: 'И-мэйл оруулна уу' }, { status: 400 })
  }

  const user = await findUserByEmail(email)
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
    await sendOtpEmail(user.email ?? email, code)
  } catch {
    return NextResponse.json({ error: 'И-мэйл илгээхэд алдаа гарлаа. Түр хүлээгээд дахин оролдоно уу' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

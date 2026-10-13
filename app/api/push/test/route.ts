import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedUserFromRequest, unauthorized } from '@/lib/auth'
import { sendTestPush } from '@/lib/push'

// Хэрэглэгч өөрийн төхөөрөмж рүү туршилтын мэдэгдэл илгээнэ — мэдэгдэл ажиллаж байгааг шалгах
export async function POST(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  const devices = await sendTestPush(user.userId)
  if (devices < 0) return NextResponse.json({ error: 'Түр хүлээгээд дахин оролдоно уу' }, { status: 429 })
  if (devices === 0) return NextResponse.json({ error: 'Энэ төхөөрөмж мэдэгдэлд бүртгэгдээгүй байна. Мэдэгдлээ унтрааж дахин асаана уу' }, { status: 404 })
  return NextResponse.json({ ok: true, devices })
}

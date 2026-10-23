import { NextResponse } from 'next/server'
import { refreshVerification } from '@/lib/phone-verification'

// SMS ирэхэд Verify.MN энд биегүй GET илгээнэ. Энэ бол зөвхөн дохио — бодит төлөвийг Verify.MN-ээс
// дахин асуудаг тул хуурамч дуудлага юу ч өөрчлөхгүй.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('v')
  if (id && id.length <= 64) await refreshVerification(id)
  return NextResponse.json({ ok: true })
}

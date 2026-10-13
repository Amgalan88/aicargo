import { NextRequest, NextResponse } from 'next/server'
import { flushPendingPush } from '@/lib/push'

export const maxDuration = 60

// Өдөр бүр 08:00 (Улаанбаатар) — шөнийн цагт (22:00–08:00) хуримтлагдсан push мэдэгдлийг илгээнэ
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await flushPendingPush()
  return NextResponse.json({ ok: true, ...r })
}

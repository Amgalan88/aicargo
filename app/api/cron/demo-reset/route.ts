import { NextRequest, NextResponse } from 'next/server'
import { seedDemoCargo } from '@/lib/demo-seed'

export const maxDuration = 60

// Өдөр бүр Vercel Cron дуудаж демо каргогийн өгөгдлийг анхны байдалд нь оруулна.
// Vercel нь CRON_SECRET env тохируулсан үед Authorization: Bearer <secret> толгойг автоматаар илгээдэг.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await seedDemoCargo()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Seed алдаа' }, { status: 500 })
  }
}

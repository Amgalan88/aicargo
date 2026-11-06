import { NextRequest, NextResponse } from 'next/server'
import { recoverUnpublished } from '@/lib/manychat/service'
import { createSqlStore } from '@/lib/manychat/store'
import { prismaSql } from '@/lib/manychat/prisma-sql'
import { publishBatchWake } from '@/lib/manychat/publish'

export const runtime = 'nodejs'
export const maxDuration = 60

// Republish admissions whose queue send never became durable. This does not
// POST to the downstream webhook. The nominal wake is still the 5s delayed
// queue message published inside the admission transaction. Vercel Cron on
// Hobby runs at most once a day; Pro can run this every minute. Neither
// interval fits inside the 3–8s coalesce window, so this only closes the
// residual case where publish timed out and the queue did not accept it.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await recoverUnpublished({
    env: process.env,
    now: () => Date.now(),
    db: createSqlStore(prismaSql()),
    publish: publishBatchWake,
  })
  return NextResponse.json({ ok: true, ...result })
}

import { NextRequest, NextResponse } from 'next/server'
import { handleReplyGuard } from '@/lib/manychat/reply-guard'
import { prismaSql } from '@/lib/manychat/prisma-sql'
import { createSqlStore } from '@/lib/manychat/store'

export const runtime = 'nodejs'

// Reads the current contact revision. It never reserves a customer send.
// MANYCHAT_REPLY_GUARD_SECRET is a separate bearer from BOT_API_KEY and from
// the ManyChat ingress secret. The handler does not call another service.
export async function POST(req: NextRequest) {
  const result = await handleReplyGuard('revision', await req.json().catch(() => null), req.headers.get('authorization'), {
    env: process.env,
    now: () => Date.now(),
    db: createSqlStore(prismaSql()),
    hostSlug: req.headers.get('x-cargo-slug'),
  })
  return NextResponse.json(result.body, { status: result.status })
}

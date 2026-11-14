import { NextRequest, NextResponse } from 'next/server'
import { handleReplyGuard } from '@/lib/manychat/reply-guard'
import { prismaSql } from '@/lib/manychat/prisma-sql'
import { createSqlStore } from '@/lib/manychat/store'

export const runtime = 'nodejs'

// Reserves the current revision once. A replay does not grant a second send.
// The handler does not deliver a customer message and does not choose a URL.
export async function POST(req: NextRequest) {
  const result = await handleReplyGuard('claim', await req.json().catch(() => null), req.headers.get('authorization'), {
    env: process.env,
    now: () => Date.now(),
    db: createSqlStore(prismaSql()),
    hostSlug: req.headers.get('x-cargo-slug'),
  })
  return NextResponse.json(result.body, { status: result.status })
}

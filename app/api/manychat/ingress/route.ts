import { NextRequest, NextResponse } from 'next/server'
import { handleIngress } from '@/lib/manychat/service'
import { createSqlStore } from '@/lib/manychat/store'
import { prismaSql } from '@/lib/manychat/prisma-sql'
import { publishBatchWake } from '@/lib/manychat/publish'

export const runtime = 'nodejs'

// Off unless MANYCHAT_GATEWAY_ENABLED=true. A bearer secret only proves the
// caller holds the ManyChat integration secret. It does not make the sender
// the page owner, and customer display name is ignored.
export async function POST(req: NextRequest) {
  const result = await handleIngress(await req.json().catch(() => null), req.headers.get('authorization'), {
    env: process.env,
    now: () => Date.now(),
    db: createSqlStore(prismaSql()),
    publish: publishBatchWake,
    hostSlug: req.headers.get('x-cargo-slug'),
  })
  return NextResponse.json(result.body, { status: result.status })
}

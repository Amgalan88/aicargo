import { handleCallback } from '@vercel/queue'
import { processQueueMessage, wakeRetry } from '@/lib/manychat/service'
import { createSqlStore } from '@/lib/manychat/store'
import { prismaSql } from '@/lib/manychat/prisma-sql'

export const runtime = 'nodejs'
export const maxDuration = 15

const store = createSqlStore(prismaSql())

// Queue push callback. Handler success acknowledges. Disabled, invalid, and
// terminal batches acknowledge. A database error before any outbound call is
// retried until the delivery bound, then acknowledged with a diagnostic.
// OIDC is checked by the SDK; this route has no static token.
export const POST = handleCallback(async (message, metadata) => {
  await processQueueMessage(message, {
    env: process.env,
    now: () => Date.now(),
    db: store,
    fetch: (url, init) => fetch(url, init),
  }, metadata)
}, {
  visibilityTimeoutSeconds: 60,
  retry: (error, metadata) => wakeRetry(error, metadata),
})

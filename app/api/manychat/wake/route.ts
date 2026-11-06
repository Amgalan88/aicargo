import { handleCallback } from '@vercel/queue'
import { processQueueMessage, wakeRetry } from '@/lib/manychat/service'
import { createSqlStore } from '@/lib/manychat/store'
import { prismaSql } from '@/lib/manychat/prisma-sql'

export const runtime = 'nodejs'
export const maxDuration = 15

const store = createSqlStore(prismaSql())

// Queue push callback. Success acknowledges. Any error other than an early
// wake is acknowledged too, so a failed or uncertain AI post is not retried
// by the queue. OIDC is checked by the SDK; this route has no static token.
export const POST = handleCallback(async message => {
  await processQueueMessage(message, {
    env: process.env,
    now: () => Date.now(),
    db: store,
    fetch: (url, init) => fetch(url, init),
  })
}, {
  visibilityTimeoutSeconds: 60,
  retry: error => wakeRetry(error),
})

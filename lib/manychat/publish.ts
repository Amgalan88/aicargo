import { COALESCE_SECONDS, PUBLISH_TIMEOUT_MS, QUEUE_REGION, RETENTION_SECONDS, TOPIC } from '@/lib/manychat/constants'

// Lazy import so tests never load the queue client. Vercel injects OIDC;
// there is no static queue token in this app.
// attempt 0 is the admission publish and carries the 5s coalesce delay.
// Later attempts are sweeper recovery after that delay has already elapsed.
export async function publishBatchWake(batchId: string, attempt = 0): Promise<void> {
  const { send } = await import('@vercel/queue')
  const delaySeconds = attempt === 0 ? COALESCE_SECONDS : 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('publish_timeout')
      error.name = 'TimeoutError'
      reject(error)
    }, PUBLISH_TIMEOUT_MS)
  })
  try {
    await Promise.race([
      send(TOPIC, { batchId }, {
        delaySeconds,
        retentionSeconds: RETENTION_SECONDS,
        idempotencyKey: `manychat-batch-${batchId}-${attempt}`,
        region: QUEUE_REGION,
      }),
      timeout,
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

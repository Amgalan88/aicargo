import { COALESCE_SECONDS, QUEUE_REGION, RETENTION_SECONDS, TOPIC } from '@/lib/manychat/constants'

// Lazy import so tests never load the queue client. Vercel injects OIDC;
// there is no static queue token in this app.
export async function publishBatchWake(batchId: string): Promise<void> {
  const { send } = await import('@vercel/queue')
  await send(TOPIC, { batchId }, {
    delaySeconds: COALESCE_SECONDS,
    retentionSeconds: RETENTION_SECONDS,
    idempotencyKey: `manychat-batch-${batchId}`,
    region: QUEUE_REGION,
  })
}

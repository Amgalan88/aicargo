import {
  authorized,
  parseIngressBody,
  filterText,
  readConfig,
  validateWebhookUrl,
  type ClaimBatch,
} from '@/lib/manychat/policy'
import { PAGE_ID, TENANT } from '@/lib/manychat/constants'
import type { GatewayStore } from '@/lib/manychat/store'

export interface HttpResult {
  status: number
  body: Record<string, unknown>
}

export interface IngressDeps {
  env: NodeJS.ProcessEnv
  now: () => number
  db: GatewayStore
  publish: (batchId: string) => Promise<void>
  hostSlug?: string | null
}

export async function handleIngress(
  rawBody: unknown,
  authorization: string | null | undefined,
  deps: IngressDeps,
): Promise<HttpResult> {
  const config = readConfig(deps.env)
  if (!config.secret) return { status: 503, body: { ok: false, error: 'not_configured' } }
  if (!authorized(authorization, config.secret)) return { status: 401, body: { ok: false, error: 'unauthorized' } }
  if (deps.hostSlug && deps.hostSlug !== TENANT) return { status: 403, body: { ok: false, error: 'forbidden_tenant' } }
  if (!config.enabled) return { status: 200, body: { ok: true, ai: false, reason: 'disabled' } }
  if (!config.webhookKey || validateWebhookUrl(config.webhookUrl)) {
    return { status: 503, body: { ok: false, error: 'not_configured' } }
  }

  const parsed = parseIngressBody(rawBody)
  if (!parsed.ok) {
    const status = parsed.error.startsWith('forbidden') ? 403 : 400
    return { status, body: { ok: false, error: parsed.error } }
  }

  const admitted = await deps.db.admit({
    now: deps.now(),
    tenant: TENANT,
    pageId: parsed.value.pageId,
    subscriberId: parsed.value.subscriberId,
    text: parsed.value.text,
    eventId: parsed.value.eventId,
    filterReason: filterText(parsed.value.text),
  })

  if (admitted.publish && admitted.batchId) {
    try {
      await deps.publish(admitted.batchId)
      await deps.db.markSchedule(admitted.batchId, 'enqueued', deps.now())
    } catch {
      try {
        await deps.db.markSchedule(admitted.batchId, 'failed', deps.now())
      } catch {
        // The row stays pending. No AI call is made from this request.
      }
      return { status: 200, body: { ok: true, ai: false, reason: 'accepted_queue_failed' } }
    }
  }

  return { status: 200, body: { ok: true, ai: false, reason: admitted.reason } }
}

export type WakeFetch = (url: string, init: RequestInit) => Promise<{ status: number }>

export interface WakeDeps {
  env: NodeJS.ProcessEnv
  now: () => number
  db: GatewayStore
  fetch: WakeFetch
}

export class DeferWake extends Error {
  constructor(readonly afterSeconds: number) {
    super('defer')
    this.name = 'DeferWake'
  }
}

export function wakeRetry(error: unknown): { afterSeconds: number } | { acknowledge: true } {
  if (error instanceof DeferWake) return { afterSeconds: error.afterSeconds }
  return { acknowledge: true }
}

export async function runWake(message: unknown, deps: WakeDeps): Promise<{ deferSeconds?: number }> {
  const config = readConfig(deps.env)
  if (!config.enabled || !config.webhookKey || validateWebhookUrl(config.webhookUrl)) return {}
  if (!message || typeof message !== 'object' || Array.isArray(message)) return {}
  const batchId = (message as { batchId?: unknown }).batchId
  if (typeof batchId !== 'string' || !/^[0-9a-f-]{36}$/i.test(batchId)) return {}

  const claim = await deps.db.claim(batchId, deps.now())
  if (claim.kind === 'defer') return { deferSeconds: claim.afterSeconds }
  // A second delivery while the first attempt is still inside the in-flight
  // window must not POST. Deferring, instead of acknowledging, lets a later
  // delivery mark a crashed attempt uncertain. It still never sends twice.
  if (claim.kind === 'in_flight') return { deferSeconds: 8 }
  if (claim.kind !== 'send') return {}

  const outcome = await postWebhook({
    url: config.webhookUrl,
    key: config.webhookKey,
    batch: claim.batch,
    fetch: deps.fetch,
  })
  const state = outcome === 'delivered' ? 'delivered' : outcome === 'timeout' || outcome === 'network' ? 'uncertain' : 'suppressed'
  await deps.db.markOutcome(batchId, state, deps.now())
  return {}
}

export async function processQueueMessage(message: unknown, deps: WakeDeps): Promise<void> {
  const result = await runWake(message, deps)
  if (result.deferSeconds) throw new DeferWake(result.deferSeconds)
}

async function postWebhook(input: {
  url: string
  key: string
  batch: ClaimBatch
  fetch: WakeFetch
}): Promise<'delivered' | 'redirect' | 'http' | 'timeout' | 'network'> {
  const body = JSON.stringify({
    tenant: TENANT,
    subscriber_id: input.batch.subscriberId,
    last_input_text: input.batch.lastInputText,
    event_id: input.batch.eventId,
    gate: {
      decision: 'forward',
      provenance: {
        tenant_source: 'server_constant',
        page_id: PAGE_ID,
        page_source: 'server_allowlist',
        sender_attestation: 'manychat_shared_secret',
        subscriber_verified: false,
        text_trust: 'untrusted_customer_content',
      },
    },
  })
  try {
    const response = await input.fetch(input.url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.key}`,
      },
      body,
      signal: AbortSignal.timeout(8000),
    })
    if (response.status >= 300 && response.status < 400) return 'redirect'
    if (response.status >= 200 && response.status < 300) return 'delivered'
    return 'http'
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') return 'timeout'
    return 'network'
  }
}

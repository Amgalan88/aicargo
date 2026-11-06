import {
  authorized,
  parseIngressBody,
  filterText,
  readConfig,
  validateWebhookUrl,
  type ClaimBatch,
} from '@/lib/manychat/policy'
import { MAX_PUBLISH_ATTEMPTS, MAX_WAKE_DELIVERIES, MISSING_BATCH_DEFERS, PAGE_ID, TENANT } from '@/lib/manychat/constants'
import { DeferWake, PublishRejected, RetryableWake, TerminalWake, classifyPublishError } from '@/lib/manychat/errors'
import type { GatewayStore, PublishFn } from '@/lib/manychat/store'

export interface HttpResult {
  status: number
  body: Record<string, unknown>
}

export interface IngressDeps {
  env: NodeJS.ProcessEnv
  now: () => number
  db: GatewayStore
  publish: PublishFn
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

  let admitted
  try {
    // Publish runs inside the admission transaction, before commit. A crash
    // after commit still has the queue message. A definite publish rejection
    // rolls the admission back so nothing is stranded.
    admitted = await deps.db.admit({
      now: deps.now(),
      tenant: TENANT,
      pageId: parsed.value.pageId,
      subscriberId: parsed.value.subscriberId,
      text: parsed.value.text,
      eventId: parsed.value.eventId,
      filterReason: filterText(parsed.value.text),
    }, async (batchId, attempt) => {
      try {
        await deps.publish(batchId, attempt)
      } catch (error) {
        if (classifyPublishError(error) === 'rejected') throw new PublishRejected()
        throw error
      }
    })
  } catch (error) {
    if (error instanceof PublishRejected) {
      return { status: 503, body: { ok: false, ai: false, error: 'queue_rejected' } }
    }
    throw error
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

export { DeferWake, RetryableWake, TerminalWake }

export function wakeRetry(error: unknown, metadata?: { deliveryCount?: number }): { afterSeconds: number } | { acknowledge: true } {
  const attempt = metadata?.deliveryCount ?? 1
  if (error instanceof TerminalWake) return { acknowledge: true }
  if (error instanceof DeferWake) {
    // In-flight defers stay retriable until claim marks a stale send uncertain.
    // Capping them would acknowledge `sending` and skip that transition.
    if (error.purpose === 'missing' && attempt >= MISSING_BATCH_DEFERS) return { acknowledge: true }
    if (error.purpose === 'early' && attempt >= MAX_WAKE_DELIVERIES) return { acknowledge: true }
    return { afterSeconds: error.afterSeconds }
  }
  if (attempt >= MAX_WAKE_DELIVERIES) return { acknowledge: true }
  return { afterSeconds: Math.min(30, 2 * attempt) }
}

export async function runWake(message: unknown, deps: WakeDeps): Promise<void> {
  const config = readConfig(deps.env)
  if (!config.enabled || !config.webhookKey || validateWebhookUrl(config.webhookUrl)) return
  if (!message || typeof message !== 'object' || Array.isArray(message)) return
  const batchId = (message as { batchId?: unknown }).batchId
  if (typeof batchId !== 'string' || !/^[0-9a-f-]{36}$/i.test(batchId)) return

  let claimed = false
  try {
    const claim = await deps.db.claim(batchId, deps.now())
    if (claim.kind === 'missing') throw new DeferWake(2, 'missing')
    if (claim.kind === 'defer') throw new DeferWake(claim.afterSeconds, 'early')
    // A second delivery while the first attempt is inside the in-flight window
    // must not POST. Deferring lets a later delivery mark a crash uncertain.
    if (claim.kind === 'in_flight') throw new DeferWake(8, 'inflight')
    if (claim.kind !== 'send') return
    claimed = true
    const outcome = await postWebhook({
      url: config.webhookUrl,
      key: config.webhookKey,
      batch: claim.batch,
      fetch: deps.fetch,
    })
    const state = outcome === 'delivered' ? 'delivered' : outcome === 'timeout' || outcome === 'network' ? 'uncertain' : 'suppressed'
    try {
      await deps.db.markOutcome(batchId, state, deps.now())
    } catch {
      // The outbound call already finished. Retrying the callback is safe
      // only until claim refuses a second POST. Recording the outcome is
      // infrastructure; losing the row in `sending` is handled by the next
      // delivery's in-flight to uncertain transition. Acknowledge so a blind
      // webhook retry cannot be implied by this error.
      throw new TerminalWake('outcome_unrecorded')
    }
  } catch (error) {
    if (error instanceof DeferWake || error instanceof TerminalWake || error instanceof RetryableWake) throw error
    if (!claimed) throw new RetryableWake('db_before_claim')
    throw new TerminalWake('after_outbound')
  }
}

export async function processQueueMessage(message: unknown, deps: WakeDeps, metadata?: { deliveryCount?: number }): Promise<void> {
  try {
    await runWake(message, deps)
  } catch (error) {
    if (error instanceof RetryableWake && (metadata?.deliveryCount ?? 1) >= MAX_WAKE_DELIVERIES) {
      const batchId = message && typeof message === 'object' && !Array.isArray(message)
        ? (message as { batchId?: unknown }).batchId
        : undefined
      if (typeof batchId === 'string') await deps.db.noteDiagnostic(batchId, 'wake_exhausted', deps.now()).catch(() => undefined)
      throw new TerminalWake('wake_exhausted')
    }
    throw error
  }
}

export async function recoverUnpublished(deps: {
  env: NodeJS.ProcessEnv
  now: () => number
  db: GatewayStore
  publish: PublishFn
}): Promise<{ skipped?: string; republished: string[]; poisoned: string[] }> {
  const config = readConfig(deps.env)
  if (!config.enabled) return { skipped: 'disabled', republished: [], poisoned: [] }
  const now = deps.now()
  const rows = await deps.db.listRecoverable(now)
  const republished: string[] = []
  const poisoned: string[] = []
  for (const row of rows) {
    const next = row.publishAttempts + 1
    try {
      await deps.publish(row.id, row.publishAttempts)
      await deps.db.markPublishResult(row.id, 'enqueued', next, null, now)
      republished.push(row.id)
    } catch (error) {
      const giveUp = classifyPublishError(error) === 'rejected' || next >= MAX_PUBLISH_ATTEMPTS
      const schedule = giveUp ? 'poisoned' : 'failed'
      const code = giveUp ? 'publish_exhausted' : 'publish_uncertain'
      await deps.db.markPublishResult(row.id, schedule, next, code, now)
      if (giveUp) poisoned.push(row.id)
    }
  }
  return { republished, poisoned }
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

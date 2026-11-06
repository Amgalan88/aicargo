import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { PAGE_ID, TENANT, HOUR_MS, TEXT_DEDUPE_MS, MAX_PER_HOUR, MAX_PUBLISH_ATTEMPTS, MAX_WAKE_DELIVERIES, MISSING_BATCH_DEFERS, SWEEP_GRACE_MS, COALESCE_MS, RESERVATION_TTL_MS } from './constants'
import { PublishRejected, RetryableWake, TerminalWake } from './errors'
import { handleReplyGuard } from './reply-guard'
import { DeferWake, handleIngress, processQueueMessage, recoverUnpublished, wakeRetry, type WakeFetch } from './service'
import { MemoryStore, createSqlStore, type GatewayStore, type PublishFn, type Sql } from './store'
import { coalesceText, filterText, parseIngressBody, validateWebhookUrl } from './policy'

const SECRET = 'test-manychat-secret'
const WEBHOOK_KEY = 'test-webhook-key'
const WEBHOOK = 'https://supporter.example/hook'
const AUTH = `Bearer ${SECRET}`

function enabledEnv(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    MANYCHAT_GATEWAY_ENABLED: 'true',
    MANYCHAT_GATEWAY_SECRET: SECRET,
    CARGO_SUPPORTER_WEBHOOK_URL: WEBHOOK,
    CARGO_SUPPORTER_WEBHOOK_KEY: WEBHOOK_KEY,
    ...extra,
  } as unknown as NodeJS.ProcessEnv
}

function message(text: string, extra: Record<string, unknown> = {}) {
  return { page_id: PAGE_ID, contact_id: '1234567890', text, ...extra }
}

function deps(store: GatewayStore, now: number, publish: PublishFn, env = enabledEnv()) {
  return { env, now: () => now, db: store, publish, hostSlug: TENANT }
}

describe('parse, filter, and webhook URL', () => {
  it('rejects malformed bodies and non-string subscribers', () => {
    for (const body of [null, [], 'nope', 1, { page_id: PAGE_ID }]) {
      const parsed = parseIngressBody(body)
      assert.equal(parsed.ok, false)
    }
    assert.equal(parseIngressBody({ page_id: PAGE_ID, contact_id: 1234567890, text: 'hi' }).ok, false)
    assert.equal(parseIngressBody({ page_id: 413037705220679, contact_id: '1234567890', text: 'hi' }).ok, false)
    assert.equal(parseIngressBody({ contact_id: '1234567890', text: 'hi' }).ok, false)
    const wrong = parseIngressBody({ page_id: '999', contact_id: '1234567890', text: 'hi' })
    assert.equal(wrong.ok, false)
    if (!wrong.ok) assert.equal(wrong.error, 'forbidden_page')
    const tenant = parseIngressBody({ tenant: 'other', page_id: PAGE_ID, contact_id: '1234567890', text: 'hi' })
    assert.equal(tenant.ok, false)
    if (!tenant.ok) assert.equal(tenant.error, 'forbidden_tenant')
    assert.equal(parseIngressBody({ page_id: PAGE_ID, contact_id: '1234', text: 'hi' }).ok, false)
    assert.equal(parseIngressBody({ page_id: PAGE_ID, contact_id: 'abcde', text: 'hi' }).ok, false)
    assert.equal(parseIngressBody({ page_id: PAGE_ID, contact_id: '1234567890', text: 'x'.repeat(1001) }).ok, false)
    assert.equal(parseIngressBody({ page_id: PAGE_ID, contact_id: '1234567890', text: 'hi', event_id: 'bad id' }).ok, false)
  })

  it('keeps real questions and drops empty, sticker, spam, and bare acknowledgements', () => {
    assert.equal(filterText(''), 'empty')
    assert.equal(filterText('ok'), 'ack')
    assert.equal(filterText('OK!'), 'ack')
    assert.equal(filterText('thanks'), 'ack')
    assert.equal(filterText('thank you'), 'ack')
    assert.equal(filterText('баярлалаа'), 'ack')
    assert.equal(filterText('за за'), 'ack')
    assert.equal(filterText('👍'), 'sticker')
    assert.equal(filterText('[sticker]'), 'sticker')
    assert.equal(filterText('a'.repeat(20)), 'spam')
    assert.equal(filterText('a'.repeat(19)), null)
    assert.equal(filterText('ok where is my parcel?'), null)
    assert.equal(filterText("thanks, what's the price?"), null)
    assert.equal(filterText('баярлалаа, хэд вэ?'), null)
    assert.equal(filterText('ачаа ирсэн үү? 👍'), null)
  })

  it('allows only a public https webhook without redirects or raw addresses', () => {
    assert.equal(validateWebhookUrl(WEBHOOK), null)
    assert.ok(validateWebhookUrl('http://supporter.example/hook'))
    assert.ok(validateWebhookUrl('https://user:pass@supporter.example/hook'))
    assert.ok(validateWebhookUrl('https://supporter.example/hook#frag'))
    assert.ok(validateWebhookUrl('https://127.0.0.1/hook'))
    assert.ok(validateWebhookUrl('https://169.254.169.254/latest'))
    assert.ok(validateWebhookUrl('https://localhost/hook'))
    assert.ok(validateWebhookUrl('https://10.1.2.3/hook'))
    const joined = coalesceText('a'.repeat(3990), 'b'.repeat(12))
    assert.equal(joined.length, 4000)
    assert.equal(joined.endsWith(`\n${'b'.repeat(12)}`), true)
  })
})

describe('ingress gates', () => {
  it('fails closed on auth, host, flag, and webhook config without touching the ledger', async () => {
    const store = new MemoryStore()
    const publish = async () => { throw new Error('publish must not run') }
    const missing = await handleIngress(message('where is it?'), AUTH, deps(store, 0, publish, enabledEnv({ MANYCHAT_GATEWAY_SECRET: '' })))
    assert.equal(missing.status, 503)
    assert.equal(missing.body.error, 'not_configured')

    const denied = await handleIngress(message('where is it?'), 'Bearer wrong', deps(store, 0, publish))
    assert.equal(denied.status, 401)

    const off = await handleIngress(message('where is it?'), AUTH, deps(store, 0, publish, enabledEnv({ MANYCHAT_GATEWAY_ENABLED: 'TRUE' })))
    assert.equal(off.status, 200)
    assert.equal(off.body.reason, 'disabled')
    assert.equal(store.counted('1234567890'), 0)

    const host = await handleIngress(message('where is it?'), AUTH, { ...deps(store, 0, publish), hostSlug: 'other' })
    assert.equal(host.status, 403)

    const http = await handleIngress(message('where is it?'), AUTH, deps(store, 0, publish, enabledEnv({ CARGO_SUPPORTER_WEBHOOK_URL: 'http://supporter.example/hook' })))
    assert.equal(http.status, 503)
    assert.equal(store.counted('1234567890'), 0)

    const metadata = await handleIngress(message('where is it?'), AUTH, deps(store, 0, publish, enabledEnv({ CARGO_SUPPORTER_WEBHOOK_URL: 'https://169.254.169.254/latest' })))
    assert.equal(metadata.status, 503)
  })

  it('returns 400 or 403 for a bad body and ignores display name and caller-supplied destination', async () => {
    const store = new MemoryStore()
    let published = 0
    const bad = await handleIngress([], AUTH, deps(store, 0, async () => { published += 1 }))
    assert.equal(bad.status, 400)
    const page = await handleIngress({ contact_id: '1234567890', text: 'hi' }, AUTH, deps(store, 0, async () => { published += 1 }))
    assert.equal(page.status, 400)
    assert.equal(page.body.error, 'invalid_page')
    const forbidden = await handleIngress(message('hi', { page_id: '111' }), AUTH, deps(store, 0, async () => { published += 1 }))
    assert.equal(forbidden.status, 403)
    let batchId = ''
    const kept = await handleIngress(message('where is parcel 10?', {
      name: 'Owner',
      owner: true,
      trusted: true,
      webhook_url: 'https://evil.example/hook',
      gate: { decision: 'owner' },
    }), AUTH, deps(store, 0, async id => { batchId = id; published += 1 }))
    assert.equal(kept.status, 200)
    assert.equal(kept.body.reason, 'queued')
    assert.equal(published, 1)
    assert.equal(store.batch(batchId)?.subscriberId, '1234567890')
  })

  it('filters without a queue publish', async () => {
    const store = new MemoryStore()
    let published = 0
    const result = await handleIngress(message('баярлалаа'), AUTH, deps(store, 0, async () => { published += 1 }))
    assert.equal(result.status, 200)
    assert.equal(result.body.ai, false)
    assert.equal(result.body.reason, 'filtered_ack')
    assert.equal(published, 0)
    assert.equal(store.counted('1234567890'), 0)
  })
})

describe('durable coalesce, dedupe, and cap', () => {
  it('counts ten unique messages under concurrency and does not wake the rest', async () => {
    const store = new MemoryStore()
    const published: string[] = []
    const tasks = Array.from({ length: 20 }, (_, i) => handleIngress(
      message(`parcel question ${i}?`, { contact_id: '555001' }),
      AUTH,
      deps(store, 1_000, async id => { published.push(id) }),
    ))
    const results = await Promise.all(tasks)
    assert.equal(results.every(result => result.status === 200 && result.body.ai === false), true)
    const counted = results.filter(result => result.body.reason === 'queued' || result.body.reason === 'coalesced')
    assert.equal(counted.length, MAX_PER_HOUR)
    assert.equal(results.filter(result => result.body.reason === 'rate_limited').length, 10)
    assert.equal(new Set(published).size, 1)
    assert.equal(store.counted('555001'), 10)
    assert.equal(store.batch(published[0])?.messageCount, 10)
  })

  it('waits out a five second quiet period and sends the joined text once', async () => {
    const store = new MemoryStore()
    const published: string[] = []
    const base = 10_000
    const first = await handleIngress(message('where is it?', { event_id: 'evt-1' }), AUTH, deps(store, base, async id => { published.push(id) }))
    const second = await handleIngress(message('which shelf?', { event_id: 'evt-2' }), AUTH, deps(store, base + 4_000, async id => { published.push(id) }))
    assert.equal(first.body.reason, 'queued')
    assert.equal(second.body.reason, 'coalesced')
    assert.equal(published.length, 1)
    assert.equal(store.batch(published[0])?.deliverAfter, base + 8_000)
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetch: WakeFetch = async (url, init) => {
      calls.push({ url, init })
      return { status: 204 }
    }
    await assert.rejects(
      () => processQueueMessage({ batchId: published[0] }, { env: enabledEnv(), now: () => base + 5_000, db: store, fetch }),
      DeferWake,
    )
    assert.equal(calls.length, 0)
    assert.deepEqual(wakeRetry(new DeferWake(1, 'early'), { deliveryCount: 1 }), { afterSeconds: 1 })
    await processQueueMessage({ batchId: published[0] }, { env: enabledEnv(), now: () => base + 8_000, db: store, fetch })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, WEBHOOK)
    assert.equal(calls[0].init.redirect, 'manual')
    const body = JSON.parse(String(calls[0].init.body))
    assert.equal(body.tenant, TENANT)
    assert.equal(body.subscriber_id, '1234567890')
    assert.equal(body.last_input_text, 'where is it?\nwhich shelf?')
    assert.equal(body.event_id, 'evt-2')
    assert.equal(body.batch_id, published[0])
    assert.equal(body.revision, 2)
    assert.equal(body.gate.provenance.subscriber_verified, false)
    assert.equal(body.gate.provenance.text_trust, 'untrusted_customer_content')
    assert.equal(store.batch(published[0])?.state, 'delivered')
    await processQueueMessage({ batchId: published[0] }, { env: enabledEnv(), now: () => base + 9_000, db: store, fetch })
    assert.equal(calls.length, 1)
  })

  it('does not count an event id twice, including after it was rate limited', async () => {
    const store = new MemoryStore()
    let published = 0
    for (let i = 0; i < 10; i++) {
      await handleIngress(message(`question ${i}?`, { event_id: `e-${i}` }), AUTH, deps(store, 0, async () => { published += 1 }))
    }
    const blocked = await handleIngress(message('one more?', { event_id: 'e-over' }), AUTH, deps(store, 0, async () => { published += 1 }))
    const retry = await handleIngress(message('one more changed?', { event_id: 'e-over' }), AUTH, deps(store, 60_000, async () => { published += 1 }))
    assert.equal(blocked.body.reason, 'rate_limited')
    assert.equal(retry.body.reason, 'duplicate')
    assert.equal(store.counted('1234567890'), 10)
    assert.equal(published, 1)
  })

  it('dedupes identical text only inside the short window when event id is absent', async () => {
    const store = new MemoryStore()
    const publish = async () => undefined
    const first = await handleIngress(message('where is it?'), AUTH, deps(store, 0, publish))
    const retry = await handleIngress(message('where is it?'), AUTH, deps(store, TEXT_DEDUPE_MS - 1, publish))
    const later = await handleIngress(message('where is it?'), AUTH, deps(store, TEXT_DEDUPE_MS, publish))
    assert.equal(first.body.reason, 'queued')
    assert.equal(retry.body.reason, 'duplicate')
    assert.equal(later.body.reason, 'queued')
    assert.equal(store.counted('1234567890'), 2)
  })

  it('keeps the batch invisible until publish returns, then wakes with no later customer message', async () => {
    const store = new MemoryStore()
    let hidden = false
    let batchId = ''
    const admitted = await handleIngress(message('where is it?'), AUTH, deps(store, 0, async id => {
      batchId = id
      hidden = store.batch(id) === undefined
    }))
    assert.equal(hidden, true)
    assert.equal(admitted.body.reason, 'queued')
    assert.equal(store.batch(batchId)?.scheduleState, 'enqueued')
    let fetches = 0
    const fetch: WakeFetch = async () => {
      fetches += 1
      return { status: 204 }
    }
    await processQueueMessage({ batchId }, { env: enabledEnv(), now: () => COALESCE_MS, db: store, fetch })
    assert.equal(fetches, 1)
    assert.equal(store.batch(batchId)?.state, 'delivered')
  })
})

describe('pre-send recovery', () => {
  it('wakes a queue accept that the client observed as a timeout, with no later customer message', async () => {
    const store = new MemoryStore()
    let batchId = ''
    const admitted = await handleIngress(message('where is it?'), AUTH, deps(store, 0, async id => {
      batchId = id
      const error = new Error('socket hang up')
      error.name = 'TimeoutError'
      throw error
    }))
    assert.equal(admitted.status, 200)
    assert.equal(admitted.body.reason, 'accepted_queue_uncertain')
    assert.equal(store.batch(batchId)?.lastError, 'publish_uncertain')
    assert.equal(store.counted('1234567890'), 1)
    let fetches = 0
    const fetch: WakeFetch = async () => {
      fetches += 1
      return { status: 200 }
    }
    await processQueueMessage({ batchId }, { env: enabledEnv(), now: () => COALESCE_MS, db: store, fetch })
    await processQueueMessage({ batchId }, { env: enabledEnv(), now: () => COALESCE_MS + 5_000, db: store, fetch })
    assert.equal(fetches, 1)
    assert.equal(store.batch(batchId)?.state, 'delivered')
  })

  it('recovers a timed-out publish the queue did not accept, without a later customer message', async () => {
    const store = new MemoryStore()
    const publishes: number[] = []
    const admitted = await handleIngress(message('where is it?'), AUTH, deps(store, 0, async (_id, attempt) => {
      publishes.push(attempt)
      const error = new Error('timeout')
      error.name = 'TimeoutError'
      throw error
    }))
    assert.equal(admitted.body.reason, 'accepted_queue_uncertain')
    const early = await recoverUnpublished({
      env: enabledEnv(),
      now: () => COALESCE_MS + SWEEP_GRACE_MS - 1,
      db: store,
      publish: async (_batchId, attempt) => { publishes.push(attempt) },
    })
    assert.deepEqual(early.republished, [])
    const recovered = await recoverUnpublished({
      env: enabledEnv(),
      now: () => COALESCE_MS + SWEEP_GRACE_MS,
      db: store,
      publish: async (_batchId, attempt) => { publishes.push(attempt) },
    })
    assert.equal(recovered.republished.length, 1)
    assert.deepEqual(publishes, [0, 1])
    let fetches = 0
    await processQueueMessage({ batchId: recovered.republished[0] }, {
      env: enabledEnv(),
      now: () => COALESCE_MS + SWEEP_GRACE_MS,
      db: store,
      fetch: async () => {
        fetches += 1
        return { status: 204 }
      },
    })
    assert.equal(fetches, 1)
    const again = await recoverUnpublished({
      env: enabledEnv(),
      now: () => COALESCE_MS + SWEEP_GRACE_MS + 1_000,
      db: store,
      publish: async () => { throw new Error('should not publish') },
    })
    assert.deepEqual(again.republished, [])
  })

  it('rolls back a definite publish rejection and stops after the publish bound', async () => {
    const store = new MemoryStore()
    const rejected = await handleIngress(message('where is it?'), AUTH, deps(store, 0, async () => { throw new PublishRejected() }))
    assert.equal(rejected.status, 503)
    assert.equal(rejected.body.error, 'queue_rejected')
    assert.equal(store.counted('1234567890'), 0)

    const exhausted = new MemoryStore()
    let attempts = 0
    await handleIngress(message('where is it?'), AUTH, deps(exhausted, 0, async () => {
      attempts += 1
      const error = new Error('timeout')
      error.name = 'TimeoutError'
      throw error
    }))
    const publish = async () => {
      attempts += 1
      const error = new Error('timeout')
      error.name = 'TimeoutError'
      throw error
    }
    const now = COALESCE_MS + SWEEP_GRACE_MS
    let poisoned: string[] = []
    for (let i = 0; i < MAX_PUBLISH_ATTEMPTS; i++) {
      const result = await recoverUnpublished({ env: enabledEnv(), now: () => now, db: exhausted, publish })
      poisoned = result.poisoned
      if (poisoned.length === 1) break
    }
    assert.equal(poisoned.length, 1)
    assert.equal(attempts, MAX_PUBLISH_ATTEMPTS)
    const stopped = await recoverUnpublished({
      env: enabledEnv(),
      now: () => now + 1,
      db: exhausted,
      publish: async () => { attempts += 1 },
    })
    assert.deepEqual(stopped.republished, [])
    assert.equal(attempts, MAX_PUBLISH_ATTEMPTS)
    assert.equal(exhausted.batch(poisoned[0])?.lastError, 'publish_exhausted')
  })
})

describe('wake failure semantics', () => {
  it('does not follow a redirect and does not retry delivered, uncertain, or overlapped sends', async () => {
    const store = new MemoryStore()
    let batchId = ''
    await handleIngress(message('where is it?'), AUTH, deps(store, 0, async id => { batchId = id }))
    const calls: string[] = []
    const redirect: WakeFetch = async () => {
      calls.push('redirect')
      return { status: 302 }
    }
    await processQueueMessage({ batchId }, { env: enabledEnv(), now: () => 5_000, db: store, fetch: redirect })
    assert.deepEqual(calls, ['redirect'])
    assert.equal(store.batch(batchId)?.state, 'suppressed')
    await processQueueMessage({ batchId }, { env: enabledEnv(), now: () => 9_000, db: store, fetch: redirect })
    assert.equal(calls.length, 1)

    const timed = new MemoryStore()
    let timedId = ''
    await handleIngress(message('where is it?'), AUTH, deps(timed, 0, async id => { timedId = id }))
    const timeout: WakeFetch = async () => {
      calls.push('timeout')
      const error = new Error('timed out')
      error.name = 'TimeoutError'
      throw error
    }
    await processQueueMessage({ batchId: timedId }, { env: enabledEnv(), now: () => 5_000, db: timed, fetch: timeout })
    assert.equal(timed.batch(timedId)?.state, 'uncertain')
    await processQueueMessage({ batchId: timedId }, { env: enabledEnv(), now: () => 70_000, db: timed, fetch: timeout })
    assert.equal(calls.filter(call => call === 'timeout').length, 1)

    const overlap = new MemoryStore()
    let overlapId = ''
    await handleIngress(message('where is it?'), AUTH, deps(overlap, 0, async id => { overlapId = id }))
    const claimed = await overlap.claim(overlapId, 5_000)
    assert.equal(claimed.kind, 'send')
    const second = await overlap.claim(overlapId, 5_500)
    assert.equal(second.kind, 'in_flight')
    await assert.rejects(
      () => processQueueMessage({ batchId: overlapId }, { env: enabledEnv(), now: () => 6_000, db: overlap, fetch: redirect }),
      DeferWake,
    )
    assert.equal(overlap.batch(overlapId)?.state, 'sending')
    const crashed = await overlap.claim(overlapId, 5_000 + 60_000)
    assert.equal(crashed.kind, 'crash_uncertain')
    assert.equal(overlap.batch(overlapId)?.state, 'uncertain')
    await processQueueMessage({ batchId: overlapId }, { env: enabledEnv(), now: () => 90_000, db: overlap, fetch: redirect })
    assert.equal(calls.filter(call => call === 'redirect').length, 1)
  })

  it('retries a database error before claim and never resends an uncertain outbound', async () => {
    assert.deepEqual(wakeRetry(new DeferWake(5, 'early'), { deliveryCount: 1 }), { afterSeconds: 5 })
    assert.deepEqual(wakeRetry(new DeferWake(2, 'missing'), { deliveryCount: MISSING_BATCH_DEFERS }), { acknowledge: true })
    assert.deepEqual(wakeRetry(new RetryableWake('db_before_claim'), { deliveryCount: 1 }), { afterSeconds: 2 })
    assert.deepEqual(wakeRetry(new RetryableWake('db_before_claim'), { deliveryCount: MAX_WAKE_DELIVERIES }), { acknowledge: true })
    assert.deepEqual(wakeRetry(new TerminalWake('after_outbound'), { deliveryCount: 1 }), { acknowledge: true })

    const store = new MemoryStore()
    let batchId = ''
    await handleIngress(message('where is it?'), AUTH, deps(store, 0, async id => { batchId = id }))
    let fetches = 0
    const fetch: WakeFetch = async () => {
      fetches += 1
      return { status: 200 }
    }
    await processQueueMessage({ batchId }, { env: enabledEnv({ MANYCHAT_GATEWAY_ENABLED: 'false' }), now: () => 5_000, db: store, fetch })
    assert.equal(fetches, 0)
    assert.equal(store.batch(batchId)?.state, 'queued')

    let claims = 0
    const flaky: GatewayStore = {
      admit: store.admit.bind(store),
      markSchedule: store.markSchedule.bind(store),
      listRecoverable: store.listRecoverable.bind(store),
      markPublishResult: store.markPublishResult.bind(store),
      noteDiagnostic: store.noteDiagnostic.bind(store),
      markOutcome: store.markOutcome.bind(store),
      confirmSend: store.confirmSend.bind(store),
      readReply: store.readReply.bind(store),
      claimReply: store.claimReply.bind(store),
      finishReply: store.finishReply.bind(store),
      claim: async (id, now) => {
        claims += 1
        if (claims < 3) throw new Error('connection reset')
        return store.claim(id, now)
      },
    }
    const wakeDeps = { env: enabledEnv(), now: () => 5_000, db: flaky, fetch }
    await assert.rejects(() => processQueueMessage({ batchId }, wakeDeps, { deliveryCount: 1 }), RetryableWake)
    await assert.rejects(() => processQueueMessage({ batchId }, wakeDeps, { deliveryCount: 2 }), RetryableWake)
    await processQueueMessage({ batchId }, wakeDeps, { deliveryCount: 3 })
    assert.equal(fetches, 1)
    await processQueueMessage({ batchId }, { env: enabledEnv(), now: () => 6_000, db: store, fetch })
    assert.equal(fetches, 1)

    const poisoned = new MemoryStore()
    let poisonedId = ''
    await handleIngress(message('where is it?'), AUTH, deps(poisoned, 0, async id => { poisonedId = id }))
    const failingDb: GatewayStore = {
      admit: poisoned.admit.bind(poisoned),
      markSchedule: poisoned.markSchedule.bind(poisoned),
      listRecoverable: poisoned.listRecoverable.bind(poisoned),
      markPublishResult: poisoned.markPublishResult.bind(poisoned),
      noteDiagnostic: poisoned.noteDiagnostic.bind(poisoned),
      markOutcome: poisoned.markOutcome.bind(poisoned),
      confirmSend: poisoned.confirmSend.bind(poisoned),
      readReply: poisoned.readReply.bind(poisoned),
      claimReply: poisoned.claimReply.bind(poisoned),
      finishReply: poisoned.finishReply.bind(poisoned),
      claim: async () => { throw new Error('still down') },
    }
    await assert.rejects(
      () => processQueueMessage({ batchId: poisonedId }, { env: enabledEnv(), now: () => 5_000, db: failingDb, fetch }, { deliveryCount: MAX_WAKE_DELIVERIES }),
      TerminalWake,
    )
    assert.equal(fetches, 1)
    assert.equal(poisoned.batch(poisonedId)?.lastError, 'wake_exhausted')
    assert.equal(poisoned.batch(poisonedId)?.state, 'queued')

    await assert.rejects(() => processQueueMessage({ batchId: '00000000-0000-4000-8000-000000000099' }, {
      env: enabledEnv(),
      now: () => 5_000,
      db: store,
      fetch,
    }), (error: unknown) => error instanceof DeferWake && error.purpose === 'missing')

    const unrecorded = new MemoryStore()
    let unrecordedId = ''
    await handleIngress(message('where is it?'), AUTH, deps(unrecorded, 0, async id => { unrecordedId = id }))
    const dropOutcome: GatewayStore = {
      admit: unrecorded.admit.bind(unrecorded),
      markSchedule: unrecorded.markSchedule.bind(unrecorded),
      listRecoverable: unrecorded.listRecoverable.bind(unrecorded),
      markPublishResult: unrecorded.markPublishResult.bind(unrecorded),
      noteDiagnostic: unrecorded.noteDiagnostic.bind(unrecorded),
      claim: unrecorded.claim.bind(unrecorded),
      markOutcome: async () => { throw new Error('outcome write failed') },
      confirmSend: unrecorded.confirmSend.bind(unrecorded),
      readReply: unrecorded.readReply.bind(unrecorded),
      claimReply: unrecorded.claimReply.bind(unrecorded),
      finishReply: unrecorded.finishReply.bind(unrecorded),
    }
    await assert.rejects(
      () => processQueueMessage({ batchId: unrecordedId }, { env: enabledEnv(), now: () => 5_000, db: dropOutcome, fetch }),
      TerminalWake,
    )
    assert.equal(fetches, 2)
    assert.equal(unrecorded.batch(unrecordedId)?.state, 'sending')
    await assert.rejects(
      () => processQueueMessage({ batchId: unrecordedId }, { env: enabledEnv(), now: () => 6_000, db: unrecorded, fetch }),
      (error: unknown) => error instanceof DeferWake && error.purpose === 'inflight',
    )
    await processQueueMessage({ batchId: unrecordedId }, { env: enabledEnv(), now: () => 5_000 + 60_000, db: unrecorded, fetch })
    assert.equal(fetches, 2)
    assert.equal(unrecorded.batch(unrecordedId)?.state, 'uncertain')
  })
})

describe('per-contact burst', () => {
  it('merges the observed two fragments into one payload', async () => {
    const store = new MemoryStore()
    const published: string[] = []
    const base = 20_000
    await handleIngress(message('21 дээр байгаа юу', { event_id: 'frag-1' }), AUTH, deps(store, base, async id => { published.push(id) }))
    const second = await handleIngress(message('Байршил', { event_id: 'frag-2' }), AUTH, deps(store, base + 3_000, async id => { published.push(id) }))
    assert.equal(second.body.reason, 'coalesced')
    assert.equal(published.length, 1)
    assert.equal(store.batch(published[0])?.lastInputText, '21 дээр байгаа юу\nБайршил')
    const calls: string[] = []
    const fetch: WakeFetch = async (_url, init) => {
      calls.push(String(init?.body))
      return { status: 204 }
    }
    await assert.rejects(
      () => processQueueMessage({ batchId: published[0] }, { env: enabledEnv(), now: () => base + 5_000, db: store, fetch }),
      DeferWake,
    )
    await processQueueMessage({ batchId: published[0] }, { env: enabledEnv(), now: () => base + 8_000, db: store, fetch })
    assert.equal(calls.length, 1)
    assert.equal(JSON.parse(calls[0]).last_input_text, '21 дээр байгаа юу\nБайршил')
    await processQueueMessage({ batchId: published[0] }, { env: enabledEnv(), now: () => base + 9_000, db: store, fetch })
    assert.equal(calls.length, 1)
  })

  it('holds a single fragment until the five second mark', async () => {
    const store = new MemoryStore()
    const published: string[] = []
    const base = 25_000
    await handleIngress(message('only?', { event_id: 'solo' }), AUTH, deps(store, base, async id => { published.push(id) }))
    let fetches = 0
    const fetch: WakeFetch = async () => {
      fetches += 1
      return { status: 204 }
    }
    await assert.rejects(
      () => processQueueMessage({ batchId: published[0] }, { env: enabledEnv(), now: () => base + 4_999, db: store, fetch }),
      DeferWake,
    )
    assert.equal(fetches, 0)
    await processQueueMessage({ batchId: published[0] }, { env: enabledEnv(), now: () => base + 5_000, db: store, fetch })
    assert.equal(fetches, 1)
  })

  it('joins a fragment at five seconds and starts a new batch at eight', async () => {
    const store = new MemoryStore()
    const published: string[] = []
    const base = 30_000
    const publish = async (id: string) => { published.push(id) }
    await handleIngress(message('first?', { event_id: 'b-1' }), AUTH, deps(store, base, publish))
    const atFive = await handleIngress(message('still here?', { event_id: 'b-2' }), AUTH, deps(store, base + 5_000, publish))
    assert.equal(atFive.body.reason, 'coalesced')
    assert.equal(published.length, 1)
    await assert.rejects(
      () => processQueueMessage({ batchId: published[0] }, { env: enabledEnv(), now: () => base + 5_000, db: store, fetch: async () => ({ status: 204 }) }),
      DeferWake,
    )
    const atCap = await handleIngress(message('after cap?', { event_id: 'b-3' }), AUTH, deps(store, base + 8_000, publish))
    assert.equal(atCap.body.reason, 'queued')
    assert.equal(published.length, 2)
    assert.equal(store.batch(published[0])?.state, 'superseded')
    assert.equal(store.batch(published[1])?.lastInputText, 'first?\nstill here?\nafter cap?')
    let fetches = 0
    const fetch: WakeFetch = async () => {
      fetches += 1
      return { status: 204 }
    }
    await processQueueMessage({ batchId: published[0] }, { env: enabledEnv(), now: () => base + 8_000, db: store, fetch })
    assert.equal(fetches, 0)
    await processQueueMessage({ batchId: published[1] }, { env: enabledEnv(), now: () => base + 13_000, db: store, fetch })
    assert.equal(fetches, 1)
  })

  it('folds an unsent claimed batch and refuses the stale callback', async () => {
    const store = new MemoryStore()
    const published: string[] = []
    const base = 40_000
    await handleIngress(message('21 дээр байгаа юу', { event_id: 'c-1' }), AUTH, deps(store, base, async id => { published.push(id) }))
    const claimed = await store.claim(published[0], base + 5_000)
    assert.equal(claimed.kind, 'send')
    const second = await handleIngress(message('Байршил', { event_id: 'c-2' }), AUTH, deps(store, base + 6_000, async id => { published.push(id) }))
    assert.equal(store.batch(published[0])?.state, 'superseded')
    assert.equal(second.body.reason, 'queued')
    assert.equal(published.length, 2)
    let fetches = 0
    let body = ''
    const fetch: WakeFetch = async (_url, init) => {
      fetches += 1
      body = String(init?.body)
      return { status: 204 }
    }
    await processQueueMessage({ batchId: published[0] }, { env: enabledEnv(), now: () => base + 6_000, db: store, fetch })
    assert.equal(fetches, 0)
    await processQueueMessage({ batchId: published[1] }, { env: enabledEnv(), now: () => base + 11_000, db: store, fetch })
    assert.equal(fetches, 1)
    assert.equal(JSON.parse(body).last_input_text, '21 дээр байгаа юу\nБайршил')
    await processQueueMessage({ batchId: published[1] }, { env: enabledEnv(), now: () => base + 12_000, db: store, fetch })
    assert.equal(fetches, 1)
    const recoverable = await store.listRecoverable(base + 60_000)
    assert.equal(recoverable.some(row => row.id === published[0]), false)
  })

  it('keeps contacts and callback order isolated', async () => {
    const store = new MemoryStore()
    const base = 50_000
    const published: string[] = []
    await handleIngress(message('shelf A?', { contact_id: '111111', event_id: 'iso-a' }), AUTH, deps(store, base, async id => { published.push(id) }))
    await handleIngress(message('shelf B?', { contact_id: '222222', event_id: 'iso-b' }), AUTH, deps(store, base, async id => { published.push(id) }))
    const bodies: string[] = []
    const fetch: WakeFetch = async (_url, init) => {
      bodies.push(String(init?.body))
      return { status: 204 }
    }
    await processQueueMessage({ batchId: published[1] }, { env: enabledEnv(), now: () => base + 5_000, db: store, fetch })
    await processQueueMessage({ batchId: published[0] }, { env: enabledEnv(), now: () => base + 5_000, db: store, fetch })
    await processQueueMessage({ batchId: published[0] }, { env: enabledEnv(), now: () => base + 6_000, db: store, fetch })
    assert.deepEqual(bodies.map(raw => JSON.parse(raw).subscriber_id), ['222222', '111111'])
    assert.equal(JSON.parse(bodies[0]).revision, 1)
    assert.equal(JSON.parse(bodies[1]).revision, 1)
  })

  it('does not send when confirm sees a newer revision', async () => {
    const store = new MemoryStore()
    const base = 60_000
    const published: string[] = []
    await handleIngress(message('one?', { event_id: 'fence-1' }), AUTH, deps(store, base, async id => { published.push(id) }))
    const claimed = await store.claim(published[0], base + 5_000)
    assert.equal(claimed.kind, 'send')
    await handleIngress(message('two?', { event_id: 'fence-2' }), AUTH, deps(store, base + 6_000, async id => { published.push(id) }))
    const confirm = await store.confirmSend(published[0], base + 6_000)
    assert.equal(confirm.ok, false)
    assert.equal(store.batch(published[0])?.state, 'superseded')
    assert.equal(store.batch(published[1])?.state, 'queued')
  })
})

describe('postgres ledger', () => {
  it('enforces the exact hour boundary, isolation, and event dedupe in SQL', async () => {
    const db = new PGlite()
    await db.exec(readFileSync(new URL('../../prisma/migrations/20261106120000_manychat_gateway/migration.sql', import.meta.url), 'utf8'))
    const store = createSqlStore(pgliteSql(db))
    const t0 = Date.parse('2026-11-06T00:00:00.000Z')
    const published: string[] = []
    const publish = async (id: string) => { published.push(id) }
    for (let i = 0; i < 10; i++) {
      const result = await handleIngress(
        message(`question ${i}?`, { contact_id: '777001', event_id: `sql-${i}` }),
        AUTH,
        deps(store, t0, publish),
      )
      assert.equal(result.status, 200, JSON.stringify(result.body))
      assert.notEqual(result.body.reason, 'rate_limited')
    }
    const inside = await handleIngress(message('too soon?', { contact_id: '777001', event_id: 'sql-inside' }), AUTH, deps(store, t0 + HOUR_MS - 1, publish))
    assert.equal(inside.body.reason, 'rate_limited')
    const boundary = await handleIngress(message('hour elapsed?', { contact_id: '777001', event_id: 'sql-boundary' }), AUTH, deps(store, t0 + HOUR_MS, publish))
    assert.equal(boundary.body.reason, 'queued')
    const again = await handleIngress(message('hour elapsed changed?', { contact_id: '777001', event_id: 'sql-boundary' }), AUTH, deps(store, t0 + HOUR_MS + 1, publish))
    assert.equal(again.body.reason, 'duplicate')

    const insideWindow = new Date(t0 + HOUR_MS - 1000).toISOString()
    for (let i = 0; i < 10; i++) {
      await db.query(
        `INSERT INTO "ManychatAdmission"
          ("id", "tenant", "pageId", "subscriberId", "eventKey", "textKey", "kind", "counted", "reason", "batchId", "admittedAt")
         VALUES ($1, 'other', $2, '777001', NULL, NULL, 'text', true, 'queued', NULL, $3::timestamptz)`,
        [`iso-tenant-${i}`, PAGE_ID, insideWindow],
      )
      await db.query(
        `INSERT INTO "ManychatAdmission"
          ("id", "tenant", "pageId", "subscriberId", "eventKey", "textKey", "kind", "counted", "reason", "batchId", "admittedAt")
         VALUES ($1, $2, '999', '777001', NULL, NULL, 'text', true, 'queued', NULL, $3::timestamptz)`,
        [`iso-page-${i}`, TENANT, insideWindow],
      )
    }
    const isolated = await handleIngress(message('other tenant must not count?', { contact_id: '777001', event_id: 'sql-isolated' }), AUTH, deps(store, t0 + HOUR_MS, publish))
    assert.equal(isolated.body.reason, 'coalesced')

    const raced = await Promise.all(Array.from({ length: 20 }, (_, i) => handleIngress(
      message(`race ${i}?`, { contact_id: '888002', event_id: `race-${i}` }),
      AUTH,
      deps(store, t0, publish),
    )))
    assert.equal(raced.filter(result => result.body.reason === 'queued' || result.body.reason === 'coalesced').length, 10)
    assert.equal(raced.filter(result => result.body.reason === 'rate_limited').length, 10)
    const counted = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM "ManychatAdmission" WHERE "subscriberId" = '888002' AND "counted" = true`,
    )
    assert.equal(Number(counted.rows[0].count), 10)
    await db.close()
  })

  it('commits an uncertain publish and rolls back a rejected one', async () => {
    const db = new PGlite()
    await db.exec(readFileSync(new URL('../../prisma/migrations/20261106120000_manychat_gateway/migration.sql', import.meta.url), 'utf8'))
    const store = createSqlStore(pgliteSql(db))
    const t0 = Date.parse('2026-11-06T00:00:00.000Z')
    const attempts: number[] = []
    const uncertain = await handleIngress(
      message('sql timeout?', { contact_id: '999003', event_id: 'sql-timeout' }),
      AUTH,
      deps(store, t0, async (_id, attempt) => {
        attempts.push(attempt)
        if (attempts.length === 1) {
          const error = new Error('timeout')
          error.name = 'TimeoutError'
          throw error
        }
      }),
    )
    assert.equal(uncertain.status, 200)
    assert.equal(uncertain.body.reason, 'accepted_queue_uncertain')
    const present = await db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM "ManychatBatch" WHERE "subscriberId" = '999003'`)
    assert.equal(Number(present.rows[0].count), 1)
    const swept = await recoverUnpublished({
      env: enabledEnv(),
      now: () => t0 + COALESCE_MS + SWEEP_GRACE_MS,
      db: store,
      publish: async (_id, attempt) => { attempts.push(attempt) },
    })
    assert.equal(swept.republished.length, 1)
    assert.deepEqual(attempts, [0, 1])
    let fetches = 0
    await processQueueMessage({ batchId: swept.republished[0] }, {
      env: enabledEnv(),
      now: () => t0 + COALESCE_MS + SWEEP_GRACE_MS,
      db: store,
      fetch: async () => {
        fetches += 1
        return { status: 204 }
      },
    })
    assert.equal(fetches, 1)

    const rejected = await handleIngress(
      message('sql reject?', { contact_id: '999004', event_id: 'sql-reject' }),
      AUTH,
      deps(store, t0, async () => { throw new PublishRejected() }),
    )
    assert.equal(rejected.status, 503)
    const left = await db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM "ManychatAdmission" WHERE "subscriberId" = '999004'`)
    assert.equal(Number(left.rows[0].count), 0)
    await db.close()
  })

  it('merges distinct fragments and concurrent callbacks into one batch', async () => {
    const db = new PGlite()
    await db.exec(readFileSync(new URL('../../prisma/migrations/20261106120000_manychat_gateway/migration.sql', import.meta.url), 'utf8'))
    const store = createSqlStore(pgliteSql(db))
    const t0 = Date.parse('2026-11-06T00:00:00.000Z')
    const published: string[] = []
    const publish = async (id: string) => { published.push(id) }
    await handleIngress(message('21 дээр байгаа юу', { contact_id: '555001', event_id: 'pg-1' }), AUTH, deps(store, t0, publish))
    const second = await handleIngress(message('Байршил', { contact_id: '555001', event_id: 'pg-2' }), AUTH, deps(store, t0 + 3_000, publish))
    assert.equal(second.body.reason, 'coalesced')
    assert.equal(published.length, 1)
    const joined = await db.query<{ text: string }>(`SELECT "lastInputText" AS text FROM "ManychatBatch" WHERE "subscriberId" = '555001'`)
    assert.equal(String(joined.rows[0].text), '21 дээр байгаа юу\nБайршил')
    const raced = await Promise.all([
      handleIngress(message('left?', { contact_id: '555002', event_id: 'pg-left' }), AUTH, deps(store, t0, publish)),
      handleIngress(message('right?', { contact_id: '555002', event_id: 'pg-right' }), AUTH, deps(store, t0, publish)),
    ])
    assert.equal(published.length, 2)
    assert.equal(raced.filter(result => result.body.reason === 'queued' || result.body.reason === 'coalesced').length, 2)
    const rows = await db.query<{ count: number; text: string }>(
      `SELECT COUNT(*)::int AS count, MAX("lastInputText") AS text FROM "ManychatBatch" WHERE "subscriberId" = '555002'`,
    )
    assert.equal(Number(rows.rows[0].count), 1)
    const text = String(rows.rows[0].text)
    assert.equal(text.includes('left?'), true)
    assert.equal(text.includes('right?'), true)
    const claimed = await store.claim(published[0], t0 + 8_000)
    assert.equal(claimed.kind, 'send')
    const folded = await handleIngress(message('again?', { contact_id: '555001', event_id: 'pg-3' }), AUTH, deps(store, t0 + 8_000, publish))
    assert.equal(folded.body.reason, 'queued')
    assert.equal(published.length, 3)
    let fetches = 0
    await processQueueMessage({ batchId: published[0] }, {
      env: enabledEnv(),
      now: () => t0 + 8_000,
      db: store,
      fetch: async () => {
        fetches += 1
        return { status: 204 }
      },
    })
    assert.equal(fetches, 0)
    const stale = await db.query<{ state: string }>(`SELECT "state" FROM "ManychatBatch" WHERE "id" = $1`, [published[0]])
    assert.equal(stale.rows[0].state, 'superseded')
    await db.close()
  })

  it('grants one reservation under the SQL lock and rejects a foreign row', async () => {
    const db = new PGlite()
    await db.exec(readFileSync(new URL('../../prisma/migrations/20261106120000_manychat_gateway/migration.sql', import.meta.url), 'utf8'))
    const store = createSqlStore(pgliteSql(db))
    const t0 = Date.parse('2026-11-06T00:00:00.000Z')
    let batchId = ''
    await handleIngress(message('sql guard?', { contact_id: '555009', event_id: 'pg-guard' }), AUTH, deps(store, t0, async id => { batchId = id }))
    await processQueueMessage({ batchId }, {
      env: enabledEnv(),
      now: () => t0 + COALESCE_MS,
      db: store,
      fetch: async () => ({ status: 204 }),
    })
    const read = await handleReplyGuard('revision', { batch_id: batchId }, GUARD_AUTH, guardDeps(store, t0 + COALESCE_MS))
    assert.equal(read.body.current, true)
    const raced = await Promise.all([0, 1].map(i => handleReplyGuard(
      'claim',
      { batch_id: batchId, revision: read.body.batch_revision, claim_id: `claim-sql-${i}1` },
      GUARD_AUTH,
      guardDeps(store, t0 + COALESCE_MS),
    )))
    assert.equal(raced.filter(result => result.body.grant === true).length, 1)
    const winner = raced.find(result => result.body.grant === true)
    await handleIngress(message('later?', { contact_id: '555009', event_id: 'pg-guard-2' }), AUTH, deps(store, t0 + COALESCE_MS + 1_000, async () => undefined))
    const finished = await handleReplyGuard('finish', {
      batch_id: batchId,
      revision: read.body.batch_revision,
      reservation_id: winner?.body.reservation_id,
      finish_id: 'finish-sql01',
      outcome: 'sent',
    }, GUARD_AUTH, guardDeps(store, t0 + COALESCE_MS + 1_000))
    assert.equal(finished.status, 409)
    assert.equal(finished.body.error, 'superseded')
    const foreignId = '11111111-1111-4111-8111-111111111111'
    await db.exec(`INSERT INTO "ManychatSubscriberLock" ("tenant", "pageId", "subscriberId", "revision", "latestBatchId") VALUES ('other', '${PAGE_ID}', '4444444444', 1, '${foreignId}')`)
    await db.exec(`INSERT INTO "ManychatBatch" ("id", "tenant", "pageId", "subscriberId", "state", "scheduleState", "openedAt", "deliverAfter", "lastInputText", "messageCount", "updatedAt", "publishAttempts", "revision") VALUES ('${foreignId}', 'other', '${PAGE_ID}', '4444444444', 'delivered', 'enqueued', '2026-11-06T00:00:00.000Z', '2026-11-06T00:00:05.000Z', 'foreign', 1, '2026-11-06T00:00:00.000Z', 0, 1)`)
    const foreign = await handleReplyGuard('claim', { batch_id: foreignId, revision: 1, claim_id: 'claim-foreign' }, GUARD_AUTH, guardDeps(store, t0 + COALESCE_MS))
    assert.equal(foreign.status, 403)
    assert.equal(foreign.body.error, 'forbidden_scope')
    const rows = await db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM "ManychatReplyReservation" WHERE "batchId" = '${foreignId}'`)
    assert.equal(Number(rows.rows[0].count), 0)
    await db.close()
  })
})

const GUARD_SECRET = 'test-reply-guard-secret'
const GUARD_AUTH = `Bearer ${GUARD_SECRET}`

function guardEnv(extra: Record<string, string | undefined> = {}) {
  return enabledEnv({ MANYCHAT_REPLY_GUARD_SECRET: GUARD_SECRET, ...extra })
}

function guardDeps(store: GatewayStore, now: number, env = guardEnv()) {
  return { env, now: () => now, db: store, hostSlug: TENANT }
}

async function deliverBatch(store: MemoryStore, now: number, eventId: string, contact = '1234567890', text = 'where is the shelf?') {
  let batchId = ''
  await handleIngress(message(text, { event_id: eventId, contact_id: contact }), AUTH, deps(store, now, async id => { batchId = id }))
  await processQueueMessage({ batchId }, {
    env: enabledEnv(),
    now: () => now + COALESCE_MS,
    db: store,
    fetch: async () => ({ status: 204 }),
  })
  return { batchId, revision: store.batch(batchId)?.revision ?? 0 }
}

describe('reply guard', () => {
  it('fails closed when disabled and rejects the wrong credentials', async () => {
    const store = new MemoryStore()
    let hits = 0
    store.readReply = async () => { hits += 1; throw new Error('db') }
    store.claimReply = async () => { hits += 1; throw new Error('db') }
    store.finishReply = async () => { hits += 1; throw new Error('db') }
    const disabled = await handleReplyGuard('claim', { batch_id: '00000000-0000-4000-8000-000000000001', revision: 1, claim_id: 'claim-disabled' }, GUARD_AUTH, guardDeps(store, 0, guardEnv({ MANYCHAT_GATEWAY_ENABLED: 'false' })))
    assert.equal(disabled.status, 403)
    assert.equal(disabled.body.error, 'disabled')
    assert.equal(disabled.body.grant, false)
    const missing = await handleReplyGuard('revision', { batch_id: '00000000-0000-4000-8000-000000000001' }, GUARD_AUTH, guardDeps(store, 0, enabledEnv()))
    assert.equal(missing.status, 503)
    assert.equal(missing.body.error, 'not_configured')
    const ingressSecret = await handleReplyGuard('claim', { batch_id: '00000000-0000-4000-8000-000000000001', revision: 1, claim_id: 'claim-ingress' }, AUTH, guardDeps(store, 0))
    assert.equal(ingressSecret.status, 401)
    const botKey = await handleReplyGuard('claim', { batch_id: '00000000-0000-4000-8000-000000000001', revision: 1, claim_id: 'claim-bot' }, 'Bearer bot-secret', guardDeps(store, 0, guardEnv({ BOT_API_KEY: 'bot-secret' })))
    assert.equal(botKey.status, 401)
    const webhookKey = await handleReplyGuard('finish', { batch_id: '00000000-0000-4000-8000-000000000001', revision: 1, reservation_id: '00000000-0000-4000-8000-000000000002', finish_id: 'finish-webhook', outcome: 'sent' }, `Bearer ${WEBHOOK_KEY}`, guardDeps(store, 0))
    assert.equal(webhookKey.status, 401)
    const untrusted = await handleReplyGuard('claim', { batch_id: '00000000-0000-4000-8000-000000000001', revision: 1, claim_id: 'claim-scope', tenant: TENANT, page_id: PAGE_ID }, GUARD_AUTH, guardDeps(store, 0))
    assert.equal(untrusted.status, 400)
    assert.equal(untrusted.body.error, 'untrusted_field')
    assert.equal(hits, 0)
  })

  it('reads the current revision and grants one reservation', async () => {
    const store = new MemoryStore()
    const base = 70_000
    const handed = await deliverBatch(store, base, 'guard-read')
    const read = await handleReplyGuard('revision', { batch_id: handed.batchId }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS))
    assert.equal(read.status, 200)
    assert.equal(read.body.grant, false)
    assert.equal(read.body.current, true)
    assert.equal(read.body.current_revision, handed.revision)
    assert.equal(read.body.reservation_state, 'none')
    const queued = new MemoryStore()
    let early = ''
    await handleIngress(message('not yet?', { event_id: 'guard-early' }), AUTH, deps(queued, base, async id => { early = id }))
    const tooSoon = await handleReplyGuard('claim', { batch_id: early, revision: 1, claim_id: 'claim-early1' }, GUARD_AUTH, guardDeps(queued, base))
    assert.equal(tooSoon.body.reason, 'not_eligible')
    assert.equal(tooSoon.body.grant, false)
    const first = await handleReplyGuard('claim', { batch_id: handed.batchId, revision: handed.revision, claim_id: 'claim-owner1' }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS))
    assert.equal(first.status, 200)
    assert.equal(first.body.grant, true)
    assert.equal(first.body.reason, 'reserved')
    assert.equal(first.body.revision, handed.revision)
    assert.equal(first.body.expires_at, new Date(base + COALESCE_MS + RESERVATION_TTL_MS).toISOString())
    const replay = await handleReplyGuard('claim', { batch_id: handed.batchId, revision: handed.revision, claim_id: 'claim-owner1' }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS + 1))
    assert.equal(replay.status, 200)
    assert.equal(replay.body.grant, false)
    assert.equal(replay.body.reason, 'already_reserved')
    assert.equal(replay.body.replay, true)
    assert.equal(replay.body.reservation_id, first.body.reservation_id)
    const other = await handleReplyGuard('claim', { batch_id: handed.batchId, revision: handed.revision, claim_id: 'claim-other1' }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS + 2))
    assert.equal(other.body.grant, false)
    assert.equal(other.body.reason, 'already_reserved')
    assert.equal(other.body.reservation_id, null)
  })

  it('lets only one simultaneous claim grant', async () => {
    const store = new MemoryStore()
    const base = 80_000
    const handed = await deliverBatch(store, base, 'guard-race')
    const results = await Promise.all([0, 1, 2, 3].map(i => handleReplyGuard(
      'claim',
      { batch_id: handed.batchId, revision: handed.revision, claim_id: `claim-race-${i}` },
      GUARD_AUTH,
      guardDeps(store, base + COALESCE_MS),
    )))
    assert.equal(results.filter(result => result.body.grant === true).length, 1)
    assert.equal(results.filter(result => result.body.reason === 'already_reserved').length, 3)
  })

  it('rejects another subscriber, batch, or revision', async () => {
    const store = new MemoryStore()
    const base = 90_000
    const first = await deliverBatch(store, base, 'guard-a', '1111111111', 'shelf A?')
    const second = await deliverBatch(store, base, 'guard-b', '2222222222', 'shelf B?')
    const crossSubscriber = await handleReplyGuard('claim', { batch_id: first.batchId, revision: first.revision, claim_id: 'claim-cross1', subscriber_id: '2222222222' }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS))
    assert.equal(crossSubscriber.status, 403)
    assert.equal(crossSubscriber.body.error, 'forbidden_subscriber')
    const stale = await handleReplyGuard('claim', { batch_id: first.batchId, revision: first.revision + 9, claim_id: 'claim-stale1' }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS))
    assert.equal(stale.body.grant, false)
    assert.equal(stale.body.reason, 'stale_revision')
    const owned = await handleReplyGuard('claim', { batch_id: first.batchId, revision: first.revision, claim_id: 'claim-owned1' }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS))
    assert.equal(owned.body.grant, true)
    const reused = await handleReplyGuard('claim', { batch_id: second.batchId, revision: second.revision, claim_id: 'claim-owned1' }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS))
    assert.equal(reused.status, 409)
    assert.equal(reused.body.error, 'claim_id_mismatch')
    const secondGrant = await handleReplyGuard('claim', { batch_id: second.batchId, revision: second.revision, claim_id: 'claim-owned2' }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS))
    assert.equal(secondGrant.body.grant, true)
  })

  it('supersedes a reservation when a newer fragment arrives and finishes once', async () => {
    const store = new MemoryStore()
    const base = 100_000
    const handed = await deliverBatch(store, base, 'guard-old', '3333333333')
    const claim = await handleReplyGuard('claim', { batch_id: handed.batchId, revision: handed.revision, claim_id: 'claim-live01' }, GUARD_AUTH, guardDeps(store, base + 6_000))
    assert.equal(claim.body.grant, true)
    await handleIngress(message('Байршил', { event_id: 'guard-new', contact_id: '3333333333' }), AUTH, deps(store, base + 6_000, async () => undefined))
    const finished = await handleReplyGuard('finish', {
      batch_id: handed.batchId,
      revision: handed.revision,
      reservation_id: claim.body.reservation_id,
      finish_id: 'finish-live1',
      outcome: 'sent',
    }, GUARD_AUTH, guardDeps(store, base + 6_000))
    assert.equal(finished.status, 409)
    assert.equal(finished.body.error, 'superseded')
    assert.equal(finished.body.grant, false)
    const again = await handleReplyGuard('claim', { batch_id: handed.batchId, revision: handed.revision, claim_id: 'claim-live02' }, GUARD_AUTH, guardDeps(store, base + 6_000))
    assert.equal(again.body.grant, false)
    assert.equal(again.body.reason, 'superseded')
  })

  it('treats replay, mismatch, expiry, and unknown as terminal', async () => {
    const store = new MemoryStore()
    const base = 110_000
    const handed = await deliverBatch(store, base, 'guard-finish')
    const claim = await handleReplyGuard('claim', { batch_id: handed.batchId, revision: handed.revision, claim_id: 'claim-fin001' }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS))
    const sent = await handleReplyGuard('finish', {
      batch_id: handed.batchId,
      revision: handed.revision,
      reservation_id: claim.body.reservation_id,
      finish_id: 'finish-sent1',
      outcome: 'sent',
    }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS + 10))
    assert.equal(sent.status, 200)
    assert.equal(sent.body.grant, false)
    assert.equal(sent.body.outcome, 'sent')
    assert.equal(sent.body.replay, false)
    const repeat = await handleReplyGuard('finish', {
      batch_id: handed.batchId,
      revision: handed.revision,
      reservation_id: claim.body.reservation_id,
      finish_id: 'finish-sent1',
      outcome: 'sent',
    }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS + 11))
    assert.equal(repeat.status, 200)
    assert.equal(repeat.body.replay, true)
    assert.equal(repeat.body.grant, false)
    const flipped = await handleReplyGuard('finish', {
      batch_id: handed.batchId,
      revision: handed.revision,
      reservation_id: claim.body.reservation_id,
      finish_id: 'finish-sent1',
      outcome: 'not_sent',
    }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS + 12))
    assert.equal(flipped.status, 409)
    assert.equal(flipped.body.error, 'finish_mismatch')
    const otherFinish = await handleReplyGuard('finish', {
      batch_id: handed.batchId,
      revision: handed.revision,
      reservation_id: claim.body.reservation_id,
      finish_id: 'finish-sent2',
      outcome: 'sent',
    }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS + 13))
    assert.equal(otherFinish.status, 409)
    const mismatch = await handleReplyGuard('finish', {
      batch_id: handed.batchId,
      revision: handed.revision + 1,
      reservation_id: claim.body.reservation_id,
      finish_id: 'finish-sent1',
      outcome: 'sent',
    }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS + 14))
    assert.equal(mismatch.status, 409)
    assert.equal(mismatch.body.error, 'reservation_mismatch')
    const retry = await handleReplyGuard('claim', { batch_id: handed.batchId, revision: handed.revision, claim_id: 'claim-fin002' }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS + 15))
    assert.equal(retry.body.grant, false)
    assert.equal(retry.body.reason, 'already_finished')

    const unknownStore = new MemoryStore()
    const unknownHanded = await deliverBatch(unknownStore, base, 'guard-unknown')
    const unknownClaim = await handleReplyGuard('claim', { batch_id: unknownHanded.batchId, revision: unknownHanded.revision, claim_id: 'claim-unk001' }, GUARD_AUTH, guardDeps(unknownStore, base + COALESCE_MS))
    const unknown = await handleReplyGuard('finish', {
      batch_id: unknownHanded.batchId,
      revision: unknownHanded.revision,
      reservation_id: unknownClaim.body.reservation_id,
      finish_id: 'finish-unk01',
      outcome: 'unknown',
    }, GUARD_AUTH, guardDeps(unknownStore, base + COALESCE_MS))
    assert.equal(unknown.body.outcome, 'unknown')
    const unknownReplay = await handleReplyGuard('finish', {
      batch_id: unknownHanded.batchId,
      revision: unknownHanded.revision,
      reservation_id: unknownClaim.body.reservation_id,
      finish_id: 'finish-unk01',
      outcome: 'unknown',
    }, GUARD_AUTH, guardDeps(unknownStore, base + COALESCE_MS + 1))
    assert.equal(unknownReplay.body.replay, true)
    const afterUnknown = await handleReplyGuard('claim', { batch_id: unknownHanded.batchId, revision: unknownHanded.revision, claim_id: 'claim-unk002' }, GUARD_AUTH, guardDeps(unknownStore, base + COALESCE_MS + 2))
    assert.equal(afterUnknown.body.grant, false)
    assert.equal(afterUnknown.body.reason, 'unknown_outcome')

    const expiryStore = new MemoryStore()
    const expiryHanded = await deliverBatch(expiryStore, base, 'guard-expiry')
    const expiryClaim = await handleReplyGuard('claim', { batch_id: expiryHanded.batchId, revision: expiryHanded.revision, claim_id: 'claim-exp001' }, GUARD_AUTH, guardDeps(expiryStore, base + COALESCE_MS))
    const expired = await handleReplyGuard('claim', { batch_id: expiryHanded.batchId, revision: expiryHanded.revision, claim_id: 'claim-exp001' }, GUARD_AUTH, guardDeps(expiryStore, base + COALESCE_MS + RESERVATION_TTL_MS))
    assert.equal(expired.body.grant, false)
    assert.equal(expired.body.reason, 'expired')
    const lateFinish = await handleReplyGuard('finish', {
      batch_id: expiryHanded.batchId,
      revision: expiryHanded.revision,
      reservation_id: expiryClaim.body.reservation_id,
      finish_id: 'finish-exp01',
      outcome: 'sent',
    }, GUARD_AUTH, guardDeps(expiryStore, base + COALESCE_MS + RESERVATION_TTL_MS))
    assert.equal(lateFinish.status, 409)
    assert.equal(lateFinish.body.error, 'expired')
  })

  it('does not grant when the wake outcome is uncertain', async () => {
    const store = new MemoryStore()
    const base = 120_000
    let batchId = ''
    await handleIngress(message('timeout path?', { event_id: 'guard-timeout' }), AUTH, deps(store, base, async id => { batchId = id }))
    await processQueueMessage({ batchId }, {
      env: enabledEnv(),
      now: () => base + COALESCE_MS,
      db: store,
      fetch: async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }) },
    })
    assert.equal(store.batch(batchId)?.state, 'uncertain')
    const claim = await handleReplyGuard('claim', { batch_id: batchId, revision: store.batch(batchId)?.revision, claim_id: 'claim-uncert1' }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS))
    assert.equal(claim.body.grant, false)
    assert.equal(claim.body.reason, 'wake_uncertain')
    const again = await handleReplyGuard('claim', { batch_id: batchId, revision: store.batch(batchId)?.revision, claim_id: 'claim-uncert2' }, GUARD_AUTH, guardDeps(store, base + COALESCE_MS + 1))
    assert.equal(again.body.grant, false)
    assert.equal(again.body.reason, 'wake_uncertain')
  })

  it('returns unavailable when the ledger throws and does not grant', async () => {
    const store = new MemoryStore()
    store.claimReply = async () => { throw new Error('connection reset') }
    const result = await handleReplyGuard('claim', { batch_id: '00000000-0000-4000-8000-0000000000aa', revision: 1, claim_id: 'claim-throw1' }, GUARD_AUTH, guardDeps(store, 0))
    assert.equal(result.status, 503)
    assert.equal(result.body.grant, false)
    assert.equal(result.body.error, 'unavailable')
  })
})

function pgliteSql(db: PGlite): Sql {
  return {
    query: async (text, params = []) => (await db.query<Record<string, unknown>>(text, params)).rows,
    transaction: fn => db.transaction(async tx => fn({
      query: async (text, params = []) => (await tx.query<Record<string, unknown>>(text, params)).rows,
      transaction: nested => nested({
        query: async (text, params = []) => (await tx.query<Record<string, unknown>>(text, params)).rows,
        transaction: () => Promise.reject(new Error('nested')),
      }),
    })),
  }
}

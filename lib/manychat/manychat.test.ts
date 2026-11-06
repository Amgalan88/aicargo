import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { PAGE_ID, TENANT, HOUR_MS, TEXT_DEDUPE_MS, MAX_PER_HOUR, MAX_PUBLISH_ATTEMPTS, MAX_WAKE_DELIVERIES, MISSING_BATCH_DEFERS, SWEEP_GRACE_MS, COALESCE_MS } from './constants'
import { PublishRejected, RetryableWake, TerminalWake } from './errors'
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

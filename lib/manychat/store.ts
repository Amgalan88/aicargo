import { randomUUID } from 'crypto'
import { MAX_PUBLISH_ATTEMPTS, SWEEP_GRACE_MS } from '@/lib/manychat/constants'
import { PublishRejected, classifyPublishError } from '@/lib/manychat/errors'
import {
  type ClaimBatch,
  type Decision,
  type FilterReason,
  type OpenBatch,
  type ScheduleState,
  decide,
  decideClaim,
  deliverAfter,
  eventKey,
  textKey,
  textWindowStart,
  windowStart,
} from '@/lib/manychat/policy'

export interface AdmitInput {
  now: number
  tenant: string
  pageId: string
  subscriberId: string
  text: string
  eventId: string | null
  filterReason: FilterReason | null
}

export interface AdmitResult {
  reason: string
  batchId: string | null
  publish: boolean
}

export type PublishFn = (batchId: string, attempt: number) => Promise<void>

export interface RecoverableBatch {
  id: string
  publishAttempts: number
  deliverAfter: number
  scheduleState: ScheduleState
}

export type OutcomeState = 'delivered' | 'uncertain' | 'suppressed'

export type ClaimResult =
  | { kind: 'missing' }
  | { kind: 'terminal' }
  | { kind: 'in_flight' }
  | { kind: 'reject_scope' }
  | { kind: 'crash_uncertain' }
  | { kind: 'defer'; afterSeconds: number }
  | { kind: 'send'; batch: ClaimBatch }

export interface GatewayStore {
  admit(input: AdmitInput, publish?: PublishFn): Promise<AdmitResult>
  markSchedule(batchId: string, schedule: ScheduleState, now: number): Promise<void>
  claim(batchId: string, now: number): Promise<ClaimResult>
  markOutcome(batchId: string, state: OutcomeState, now: number): Promise<void>
  listRecoverable(now: number): Promise<RecoverableBatch[]>
  markPublishResult(batchId: string, schedule: ScheduleState, attempts: number, lastError: string | null, now: number): Promise<void>
  noteDiagnostic(batchId: string, code: string, now: number): Promise<void>
}

interface AdmissionRow {
  eventKey: string | null
  textKey: string | null
  counted: boolean
  admittedAt: number
}

interface BatchRow extends ClaimBatch {
  scheduleState: ScheduleState
  openedAt: number
  lastInputText: string
  messageCount: number
  eventId: string | null
  publishAttempts: number
  lastError: string | null
}

function keysFor(input: AdmitInput): { eventKey: string | null; textKey: string | null; kind: 'event' | 'text' } {
  if (input.eventId) return { eventKey: eventKey(input.pageId, input.eventId), textKey: null, kind: 'event' }
  if (input.filterReason) return { eventKey: null, textKey: null, kind: 'text' }
  return { eventKey: null, textKey: textKey(input.pageId, input.subscriberId, input.text), kind: 'text' }
}

function summarize(input: AdmitInput, admissions: AdmissionRow[], batches: BatchRow[]) {
  const keys = keysFor(input)
  const eventSeen = keys.eventKey !== null && admissions.some(row => row.eventKey === keys.eventKey)
  const textSeen = keys.textKey !== null && admissions.some(row => row.textKey === keys.textKey && row.admittedAt > textWindowStart(input.now))
  const countedInWindow = admissions.filter(row => row.counted && row.admittedAt > windowStart(input.now)).length
  const open = batches
    .filter(batch => (batch.state === 'open' || batch.state === 'queued') && batch.deliverAfter > input.now && batch.scheduleState !== 'poisoned')
    .sort((a, b) => b.openedAt - a.openedAt)[0] ?? null
  const openBatch: OpenBatch | null = open
    ? {
        id: open.id,
        lastInputText: open.lastInputText,
        messageCount: open.messageCount,
        eventId: open.eventId,
        scheduleState: open.scheduleState,
        openedAt: open.openedAt,
      }
    : null
  return { keys, decision: decide({ ...input, eventSeen, textSeen, countedInWindow, openBatch }) }
}

export class MemoryStore implements GatewayStore {
  private admissions: Array<AdmissionRow & { tenant: string; pageId: string; subscriberId: string }> = []
  private batches = new Map<string, BatchRow>()
  private chains = new Map<string, Promise<unknown>>()

  private lock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve()
    const run = prev.then(fn, fn)
    this.chains.set(key, run.then(() => undefined, () => undefined))
    return run
  }

  admit(input: AdmitInput, publish?: PublishFn): Promise<AdmitResult> {
    const key = `${input.tenant}|${input.pageId}|${input.subscriberId}`
    return this.lock(key, () => this.admitLocked(input, publish))
  }

  private async admitLocked(input: AdmitInput, publish?: PublishFn): Promise<AdmitResult> {
    const mineA = this.admissions.filter(row => row.tenant === input.tenant && row.pageId === input.pageId && row.subscriberId === input.subscriberId)
    const mineB = [...this.batches.values()].filter(row => row.tenant === input.tenant && row.pageId === input.pageId && row.subscriberId === input.subscriberId)
    const { keys, decision: local } = summarize(input, mineA, mineB)
    const eventSeen = keys.eventKey !== null && this.admissions.some(row => row.eventKey === keys.eventKey)
    const decision = eventSeen && local.type !== 'duplicate'
      ? decide({
          filterReason: input.filterReason,
          eventSeen: true,
          textSeen: false,
          countedInWindow: 0,
          openBatch: null,
          now: input.now,
          text: input.text,
          eventId: input.eventId,
        })
      : local
    return this.apply(input, keys, decision, publish)
  }

  private async apply(input: AdmitInput, keys: { eventKey: string | null; textKey: string | null; kind: 'event' | 'text' }, decision: Decision, publish?: PublishFn): Promise<AdmitResult> {
    if (decision.type === 'duplicate') return { reason: 'duplicate', batchId: null, publish: false }
    if (decision.type === 'record') {
      this.admissions.push({
        tenant: input.tenant, pageId: input.pageId, subscriberId: input.subscriberId,
        eventKey: decision.reason === 'rate_limited' ? keys.eventKey : (input.filterReason && keys.eventKey ? keys.eventKey : null),
        textKey: decision.reason === 'rate_limited' ? keys.textKey : null,
        counted: false,
        admittedAt: input.now,
      })
      return { reason: decision.reason, batchId: null, publish: false }
    }
    if (decision.type === 'join') {
      const batch = this.batches.get(decision.batchId)
      if (!batch) return { reason: 'duplicate', batchId: null, publish: false }
      batch.lastInputText = decision.text
      batch.eventId = decision.eventId
      batch.messageCount = decision.messageCount
      const published = decision.publish ? await this.settle(batch, publish) : false
      this.admissions.push({
        tenant: input.tenant, pageId: input.pageId, subscriberId: input.subscriberId,
        eventKey: keys.eventKey, textKey: keys.textKey, counted: true, admittedAt: input.now,
      })
      return { reason: published === 'uncertain' ? 'accepted_queue_uncertain' : decision.reason, batchId: batch.id, publish: decision.publish }
    }
    const id = randomUUID()
    const row: BatchRow = {
      id,
      tenant: input.tenant,
      pageId: input.pageId,
      subscriberId: input.subscriberId,
      state: 'open',
      scheduleState: 'pending',
      openedAt: input.now,
      deliverAfter: deliverAfter(input.now),
      lastInputText: decision.text,
      eventId: decision.eventId,
      messageCount: 1,
      deliveryAttemptedAt: null,
      publishAttempts: 0,
      lastError: null,
    }
    // The row stays invisible until publish returns, so a crash before the
    // insert does not leave an accepted batch with no queue message.
    const settled = await this.settle(row, publish)
    if (settled === 'rejected') throw new PublishRejected()
    this.batches.set(id, row)
    this.admissions.push({
      tenant: input.tenant, pageId: input.pageId, subscriberId: input.subscriberId,
      eventKey: keys.eventKey, textKey: keys.textKey, counted: true, admittedAt: input.now,
    })
    return { reason: settled === 'uncertain' ? 'accepted_queue_uncertain' : 'queued', batchId: id, publish: true }
  }

  private async settle(batch: BatchRow, publish?: PublishFn): Promise<'enqueued' | 'uncertain' | 'rejected'> {
    const attempt = batch.publishAttempts
    let settled: 'enqueued' | 'uncertain' | 'rejected'
    try {
      if (!publish) throw new PublishRejected()
      await publish(batch.id, attempt)
      settled = 'enqueued'
    } catch (error) {
      settled = classifyPublishError(error) === 'rejected' ? 'rejected' : 'uncertain'
    }
    batch.publishAttempts = attempt + 1
    if (settled === 'enqueued') {
      batch.scheduleState = 'enqueued'
      batch.state = 'queued'
      batch.lastError = null
    } else if (settled === 'uncertain') {
      batch.scheduleState = 'pending'
      batch.lastError = 'publish_uncertain'
    } else {
      batch.scheduleState = 'failed'
      batch.lastError = 'publish_rejected'
    }
    return settled
  }

  async markSchedule(batchId: string, schedule: ScheduleState, now: number): Promise<void> {
    const batch = this.batches.get(batchId)
    if (!batch || (batch.state !== 'open' && batch.state !== 'queued')) return
    batch.scheduleState = schedule
    if (schedule === 'enqueued') batch.state = 'queued'
    batch.deliveryAttemptedAt = batch.deliveryAttemptedAt
    void now
  }

  async claim(batchId: string, now: number): Promise<ClaimResult> {
    return this.lock(`batch:${batchId}`, () => {
      const batch = this.batches.get(batchId) ?? null
      const decision = decideClaim(batch, now)
      if (!batch) return { kind: 'missing' }
      if (decision.kind === 'crash_uncertain') {
        batch.state = 'uncertain'
        return { kind: 'crash_uncertain' }
      }
      if (decision.kind === 'send') {
        batch.state = 'sending'
        batch.deliveryAttemptedAt = now
        return { kind: 'send', batch: { ...batch } }
      }
      if (decision.kind === 'defer') return decision
      return { kind: decision.kind }
    })
  }

  async markOutcome(batchId: string, state: OutcomeState, now: number): Promise<void> {
    const batch = this.batches.get(batchId)
    if (!batch || batch.state !== 'sending') return
    batch.state = state
    void now
  }

  async listRecoverable(now: number): Promise<RecoverableBatch[]> {
    const due = now - SWEEP_GRACE_MS
    return [...this.batches.values()]
      .filter(batch => (batch.state === 'open' || batch.state === 'queued')
        && batch.deliveryAttemptedAt == null
        && batch.scheduleState !== 'poisoned'
        && batch.deliverAfter <= due
        && batch.publishAttempts < MAX_PUBLISH_ATTEMPTS)
      .map(batch => ({
        id: batch.id,
        publishAttempts: batch.publishAttempts,
        deliverAfter: batch.deliverAfter,
        scheduleState: batch.scheduleState,
      }))
  }

  async markPublishResult(batchId: string, schedule: ScheduleState, attempts: number, lastError: string | null, now: number): Promise<void> {
    const batch = this.batches.get(batchId)
    if (!batch || batch.deliveryAttemptedAt != null) return
    if (batch.state !== 'open' && batch.state !== 'queued') return
    batch.scheduleState = schedule
    batch.publishAttempts = attempts
    batch.lastError = lastError
    if (schedule === 'enqueued') batch.state = 'queued'
    void now
  }

  async noteDiagnostic(batchId: string, code: string, now: number): Promise<void> {
    const batch = this.batches.get(batchId)
    if (!batch || (batch.state !== 'open' && batch.state !== 'queued')) return
    batch.lastError = code
    void now
  }

  batch(id: string): BatchRow | undefined {
    const row = this.batches.get(id)
    return row ? { ...row } : undefined
  }

  counted(subscriberId: string): number {
    return this.admissions.filter(row => row.subscriberId === subscriberId && row.counted).length
  }
}

export interface Sql {
  query(text: string, params?: unknown[]): Promise<Array<Record<string, unknown>>>
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>
}

function stamp(ms: number): string {
  return new Date(ms).toISOString()
}

function millis(value: unknown): number {
  const n = new Date(value as string | number | Date).getTime()
  if (Number.isNaN(n)) throw new Error('bad timestamp')
  return n
}

function isUnique(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: string }).code
  if (code === '23505' || code === 'P2002') return true
  const message = (error as { message?: string }).message ?? ''
  return message.includes('23505') || message.includes('Unique constraint')
}

export function createSqlStore(db: Sql): GatewayStore {
  return {
    admit: (input, publish) => db.transaction(tx => admitSql(tx, input, publish)),
    markSchedule: (batchId, schedule, now) => markScheduleSql(db, batchId, schedule, now),
    claim: (batchId, now) => db.transaction(tx => claimSql(tx, batchId, now)),
    markOutcome: (batchId, state, now) => markOutcomeSql(db, batchId, state, now),
    listRecoverable: now => listRecoverableSql(db, now),
    markPublishResult: (batchId, schedule, attempts, lastError, now) => markPublishResultSql(db, batchId, schedule, attempts, lastError, now),
    noteDiagnostic: (batchId, code, now) => noteDiagnosticSql(db, batchId, code, now),
  }
}

async function admitSql(tx: Sql, input: AdmitInput, publish?: PublishFn): Promise<AdmitResult> {
  await tx.query(
    `INSERT INTO "ManychatSubscriberLock" ("tenant", "pageId", "subscriberId")
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [input.tenant, input.pageId, input.subscriberId],
  )
  await tx.query(
    `SELECT 1 FROM "ManychatSubscriberLock"
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3
     FOR UPDATE`,
    [input.tenant, input.pageId, input.subscriberId],
  )
  const keys = keysFor(input)
  const eventRows = keys.eventKey
    ? await tx.query(`SELECT 1 FROM "ManychatAdmission" WHERE "eventKey" = $1 LIMIT 1`, [keys.eventKey])
    : []
  const textRows = keys.textKey
    ? await tx.query(
        `SELECT 1 FROM "ManychatAdmission" WHERE "textKey" = $1 AND "admittedAt" > $2::timestamptz LIMIT 1`,
        [keys.textKey, stamp(textWindowStart(input.now))],
      )
    : []
  const countRows = await tx.query(
    `SELECT COUNT(*)::int AS count FROM "ManychatAdmission"
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3
       AND "counted" = true AND "admittedAt" > $4::timestamptz`,
    [input.tenant, input.pageId, input.subscriberId, stamp(windowStart(input.now))],
  )
  const openRows = await tx.query(
    `SELECT "id", "lastInputText", "messageCount", "eventId", "scheduleState", "openedAt"
     FROM "ManychatBatch"
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3
       AND "state" IN ('open', 'queued') AND "scheduleState" <> 'poisoned' AND "deliverAfter" > $4::timestamptz
     ORDER BY "openedAt" DESC
     LIMIT 1
     FOR UPDATE`,
    [input.tenant, input.pageId, input.subscriberId, stamp(input.now)],
  )
  const open = openRows[0]
  const openBatch: OpenBatch | null = open
    ? {
        id: String(open.id),
        lastInputText: String(open.lastInputText),
        messageCount: Number(open.messageCount),
        eventId: open.eventId == null ? null : String(open.eventId),
        scheduleState: String(open.scheduleState) as ScheduleState,
        openedAt: millis(open.openedAt),
      }
    : null
  const decision = decide({
    filterReason: input.filterReason,
    eventSeen: eventRows.length > 0,
    textSeen: textRows.length > 0,
    countedInWindow: Number(countRows[0]?.count ?? 0),
    openBatch,
    now: input.now,
    text: input.text,
    eventId: input.eventId,
  })
  try {
    return await applySql(tx, input, keys, decision, publish)
  } catch (error) {
    if (isUnique(error)) return { reason: 'duplicate', batchId: null, publish: false }
    throw error
  }
}

async function applySql(
  tx: Sql,
  input: AdmitInput,
  keys: { eventKey: string | null; textKey: string | null },
  decision: Decision,
  publish?: PublishFn,
): Promise<AdmitResult> {
  if (decision.type === 'duplicate') return { reason: 'duplicate', batchId: null, publish: false }
  const admittedAt = stamp(input.now)
  if (decision.type === 'record') {
    const keepEvent = decision.reason === 'rate_limited' || Boolean(input.filterReason)
    await tx.query(
      `INSERT INTO "ManychatAdmission"
        ("id", "tenant", "pageId", "subscriberId", "eventKey", "textKey", "kind", "counted", "reason", "batchId", "admittedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, NULL, $9::timestamptz)`,
      [
        randomUUID(), input.tenant, input.pageId, input.subscriberId,
        keepEvent ? keys.eventKey : null,
        decision.reason === 'rate_limited' ? keys.textKey : null,
        input.eventId ? 'event' : 'text',
        decision.reason,
        admittedAt,
      ],
    )
    return { reason: decision.reason, batchId: null, publish: false }
  }
  if (decision.type === 'join') {
    await tx.query(
      `UPDATE "ManychatBatch"
       SET "lastInputText" = $2, "eventId" = $3, "messageCount" = $4, "updatedAt" = $5::timestamptz
       WHERE "id" = $1 AND "state" IN ('open', 'queued')`,
      [decision.batchId, decision.text, decision.eventId, decision.messageCount, admittedAt],
    )
    const settled = decision.publish ? await settleSql(tx, decision.batchId, publish, admittedAt) : null
    await tx.query(
      `INSERT INTO "ManychatAdmission"
        ("id", "tenant", "pageId", "subscriberId", "eventKey", "textKey", "kind", "counted", "reason", "batchId", "admittedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10::timestamptz)`,
      [
        randomUUID(), input.tenant, input.pageId, input.subscriberId,
        keys.eventKey, keys.textKey, input.eventId ? 'event' : 'text',
        decision.reason, decision.batchId, admittedAt,
      ],
    )
    return {
      reason: settled === 'uncertain' ? 'accepted_queue_uncertain' : decision.reason,
      batchId: decision.batchId,
      publish: decision.publish,
    }
  }
  const id = randomUUID()
  await tx.query(
    `INSERT INTO "ManychatBatch"
      ("id", "tenant", "pageId", "subscriberId", "state", "scheduleState", "openedAt", "deliverAfter", "lastInputText", "eventId", "messageCount", "updatedAt", "publishAttempts", "lastError")
     VALUES ($1, $2, $3, $4, 'open', 'pending', $5::timestamptz, $6::timestamptz, $7, $8, 1, $5::timestamptz, 0, NULL)`,
    [id, input.tenant, input.pageId, input.subscriberId, admittedAt, stamp(deliverAfter(input.now)), decision.text, decision.eventId],
  )
  const settled = await settleSql(tx, id, publish, admittedAt)
  if (settled === 'rejected') throw new PublishRejected()
  await tx.query(
    `INSERT INTO "ManychatAdmission"
      ("id", "tenant", "pageId", "subscriberId", "eventKey", "textKey", "kind", "counted", "reason", "batchId", "admittedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'queued', $8, $9::timestamptz)`,
    [
      randomUUID(), input.tenant, input.pageId, input.subscriberId,
      keys.eventKey, keys.textKey, input.eventId ? 'event' : 'text', id, admittedAt,
    ],
  )
    return { reason: settled === 'uncertain' ? 'accepted_queue_uncertain' : 'queued', batchId: id, publish: true }
  }

async function settleSql(tx: Sql, batchId: string, publish: PublishFn | undefined, admittedAt: string): Promise<'enqueued' | 'uncertain' | 'rejected'> {
  const rows = await tx.query(
    `SELECT "publishAttempts" FROM "ManychatBatch" WHERE "id" = $1 FOR UPDATE`,
    [batchId],
  )
  const attempt = Number(rows[0]?.publishAttempts ?? 0)
  let settled: 'enqueued' | 'uncertain' | 'rejected'
  try {
    if (!publish) throw new PublishRejected()
    await publish(batchId, attempt)
    settled = 'enqueued'
  } catch (error) {
    settled = classifyPublishError(error) === 'rejected' ? 'rejected' : 'uncertain'
  }
  const schedule = settled === 'enqueued' ? 'enqueued' : settled === 'uncertain' ? 'pending' : 'failed'
  const lastError = settled === 'enqueued' ? null : settled === 'uncertain' ? 'publish_uncertain' : 'publish_rejected'
  const state = settled === 'enqueued' ? 'queued' : 'open'
  await tx.query(
    `UPDATE "ManychatBatch"
     SET "scheduleState" = $2, "state" = $3, "publishAttempts" = $4, "lastError" = $5, "updatedAt" = $6::timestamptz
     WHERE "id" = $1`,
    [batchId, schedule, state, attempt + 1, lastError, admittedAt],
  )
  return settled
}

async function markScheduleSql(db: Sql, batchId: string, schedule: ScheduleState, now: number): Promise<void> {
  await db.query(
    `UPDATE "ManychatBatch"
     SET "scheduleState" = $2,
         "state" = CASE WHEN $2 = 'enqueued' THEN 'queued' ELSE "state" END,
         "updatedAt" = $3::timestamptz
     WHERE "id" = $1 AND "state" IN ('open', 'queued')`,
    [batchId, schedule, stamp(now)],
  )
}

async function claimSql(tx: Sql, batchId: string, now: number): Promise<ClaimResult> {
  const rows = await tx.query(
    `SELECT "id", "tenant", "pageId", "subscriberId", "state", "deliverAfter", "deliveryAttemptedAt", "lastInputText", "eventId"
     FROM "ManychatBatch" WHERE "id" = $1 FOR UPDATE`,
    [batchId],
  )
  const row = rows[0]
  const batch: ClaimBatch | null = row
    ? {
        id: String(row.id),
        tenant: String(row.tenant),
        pageId: String(row.pageId),
        subscriberId: String(row.subscriberId),
        state: String(row.state),
        deliverAfter: millis(row.deliverAfter),
        deliveryAttemptedAt: row.deliveryAttemptedAt == null ? null : millis(row.deliveryAttemptedAt),
        lastInputText: String(row.lastInputText),
        eventId: row.eventId == null ? null : String(row.eventId),
      }
    : null
  const decision = decideClaim(batch, now)
  if (!batch) return { kind: 'missing' }
  if (decision.kind === 'crash_uncertain') {
    await tx.query(
      `UPDATE "ManychatBatch" SET "state" = 'uncertain', "updatedAt" = $2::timestamptz WHERE "id" = $1 AND "state" = 'sending'`,
      [batchId, stamp(now)],
    )
    return { kind: 'crash_uncertain' }
  }
  if (decision.kind === 'reject_scope') {
    await tx.query(
      `UPDATE "ManychatBatch" SET "state" = 'suppressed', "updatedAt" = $2::timestamptz
       WHERE "id" = $1 AND "state" IN ('open', 'queued', 'sending')`,
      [batchId, stamp(now)],
    )
    return { kind: 'reject_scope' }
  }
  if (decision.kind === 'send') {
    await tx.query(
      `UPDATE "ManychatBatch"
       SET "state" = 'sending', "deliveryAttemptedAt" = $2::timestamptz, "updatedAt" = $2::timestamptz
       WHERE "id" = $1 AND "state" IN ('open', 'queued')`,
      [batchId, stamp(now)],
    )
    return { kind: 'send', batch: { ...batch, state: 'sending', deliveryAttemptedAt: now } }
  }
  if (decision.kind === 'defer') return decision
  return { kind: decision.kind }
}

async function markOutcomeSql(db: Sql, batchId: string, state: OutcomeState, now: number): Promise<void> {
  await db.query(
    `UPDATE "ManychatBatch" SET "state" = $2, "updatedAt" = $3::timestamptz
     WHERE "id" = $1 AND "state" = 'sending'`,
    [batchId, state, stamp(now)],
  )
}

async function listRecoverableSql(db: Sql, now: number): Promise<RecoverableBatch[]> {
  const rows = await db.query(
    `SELECT "id", "publishAttempts", "deliverAfter", "scheduleState"
     FROM "ManychatBatch"
     WHERE "state" IN ('open', 'queued')
       AND "deliveryAttemptedAt" IS NULL
       AND "scheduleState" <> 'poisoned'
       AND "deliverAfter" <= $1::timestamptz
       AND "publishAttempts" < $2`,
    [stamp(now - SWEEP_GRACE_MS), MAX_PUBLISH_ATTEMPTS],
  )
  return rows.map(row => ({
    id: String(row.id),
    publishAttempts: Number(row.publishAttempts),
    deliverAfter: millis(row.deliverAfter),
    scheduleState: String(row.scheduleState) as ScheduleState,
  }))
}

async function markPublishResultSql(db: Sql, batchId: string, schedule: ScheduleState, attempts: number, lastError: string | null, now: number): Promise<void> {
  await db.query(
    `UPDATE "ManychatBatch"
     SET "scheduleState" = $2,
         "state" = CASE WHEN $2 = 'enqueued' THEN 'queued' ELSE "state" END,
         "publishAttempts" = $3,
         "lastError" = $4,
         "updatedAt" = $5::timestamptz
     WHERE "id" = $1 AND "state" IN ('open', 'queued') AND "deliveryAttemptedAt" IS NULL`,
    [batchId, schedule, attempts, lastError, stamp(now)],
  )
}

async function noteDiagnosticSql(db: Sql, batchId: string, code: string, now: number): Promise<void> {
  await db.query(
    `UPDATE "ManychatBatch" SET "lastError" = $2, "updatedAt" = $3::timestamptz
     WHERE "id" = $1 AND "state" IN ('open', 'queued')`,
    [batchId, code, stamp(now)],
  )
}

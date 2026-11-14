import { randomUUID } from 'crypto'
import { MAX_BURST_MS, MAX_PUBLISH_ATTEMPTS, PAGE_ID, RESERVATION_TTL_MS, SWEEP_GRACE_MS, TENANT } from '@/lib/manychat/constants'
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
  confirmSend(batchId: string, now: number): Promise<{ ok: true; batch: ClaimBatch } | { ok: false }>
  readReply(batchId: string, subscriberId: string | null, now: number): Promise<ReplyRead>
  claimReply(input: ReplyClaimInput): Promise<ReplyClaim>
  finishReply(input: ReplyFinishInput): Promise<ReplyFinish>
}

export type ReplyReservationState = 'reserved' | 'sent' | 'not_sent' | 'unknown' | 'expired' | 'superseded'
export type ReplyFinishOutcome = 'sent' | 'not_sent' | 'unknown'

export interface ReplyClaimInput {
  batchId: string
  revision: number
  claimId: string
  subscriberId: string | null
  now: number
}

export interface ReplyFinishInput {
  batchId: string
  revision: number
  reservationId: string
  finishId: string
  outcome: ReplyFinishOutcome
  subscriberId: string | null
  now: number
}

export type ReplyRead =
  | { kind: 'missing' }
  | { kind: 'forbidden_scope' }
  | { kind: 'forbidden_subscriber' }
  | {
      kind: 'ok'
      batchId: string
      subscriberId: string
      batchRevision: number
      currentRevision: number
      latestBatchId: string | null
      current: boolean
      reservationState: ReplyReservationState | 'none'
      reservationId: string | null
    }

export type ReplyClaim =
  | { kind: 'missing' }
  | { kind: 'forbidden_scope' }
  | { kind: 'forbidden_subscriber' }
  | { kind: 'claim_id_mismatch' }
  | {
      kind: 'grant'
      reservationId: string
      subscriberId: string
      batchId: string
      revision: number
      claimId: string
      expiresAt: number
    }
  | {
      kind: 'deny'
      reason: 'stale_revision' | 'already_reserved' | 'already_finished' | 'unknown_outcome' | 'expired' | 'superseded' | 'wake_uncertain' | 'not_eligible'
      replay: boolean
      reservationId: string | null
      subscriberId: string
      batchId: string
      revision: number
      currentRevision: number
      latestBatchId: string | null
      expiresAt: number | null
      outcome: ReplyFinishOutcome | null
    }

export type ReplyFinish =
  | { kind: 'missing' }
  | { kind: 'forbidden_scope' }
  | { kind: 'forbidden_subscriber' }
  | { kind: 'reservation_mismatch' }
  | { kind: 'finish_mismatch'; outcome: ReplyFinishOutcome }
  | { kind: 'closed'; error: 'expired' | 'superseded' }
  | {
      kind: 'finished'
      replay: boolean
      outcome: ReplyFinishOutcome
      reservationId: string
      finishId: string
      subscriberId: string
      batchId: string
      revision: number
    }

interface AdmissionRow {
  eventKey: string | null
  textKey: string | null
  counted: boolean
  admittedAt: number
}

interface ReservationRow {
  id: string
  tenant: string
  pageId: string
  subscriberId: string
  batchId: string
  revision: number
  claimId: string
  state: ReplyReservationState
  finishId: string | null
  reservedAt: number
  expiresAt: number
  finishedAt: number | null
}

interface BatchRow extends ClaimBatch {
  scheduleState: ScheduleState
  openedAt: number
  lastInputText: string
  messageCount: number
  eventId: string | null
  publishAttempts: number
  lastError: string | null
  revision: number
}

function keysFor(input: AdmitInput): { eventKey: string | null; textKey: string | null; kind: 'event' | 'text' } {
  if (input.eventId) return { eventKey: eventKey(input.pageId, input.eventId), textKey: null, kind: 'event' }
  if (input.filterReason) return { eventKey: null, textKey: null, kind: 'text' }
  return { eventKey: null, textKey: textKey(input.pageId, input.subscriberId, input.text), kind: 'text' }
}

function toOpen(batch: BatchRow): OpenBatch {
  return {
    id: batch.id,
    lastInputText: batch.lastInputText,
    messageCount: batch.messageCount,
    eventId: batch.eventId,
    scheduleState: batch.scheduleState,
    openedAt: batch.openedAt,
    deliverAfter: batch.deliverAfter,
  }
}

function summarize(input: AdmitInput, admissions: AdmissionRow[], batches: BatchRow[]) {
  const keys = keysFor(input)
  const eventSeen = keys.eventKey !== null && admissions.some(row => row.eventKey === keys.eventKey)
  const textSeen = keys.textKey !== null && admissions.some(row => row.textKey === keys.textKey && row.admittedAt > textWindowStart(input.now))
  const countedInWindow = admissions.filter(row => row.counted && row.admittedAt > windowStart(input.now)).length
  const latest = batches
    .filter(batch => batch.scheduleState !== 'poisoned' && (batch.state === 'open' || batch.state === 'queued' || batch.state === 'sending'))
    .sort((a, b) => b.openedAt - a.openedAt)[0] ?? null
  const joinable = latest != null && (latest.state === 'open' || latest.state === 'queued') && input.now < latest.openedAt + MAX_BURST_MS
  const openBatch = joinable && latest ? toOpen(latest) : null
  const unsentBatch = !joinable && latest ? toOpen(latest) : null
  return { keys, decision: decide({ ...input, eventSeen, textSeen, countedInWindow, openBatch, unsentBatch }) }
}

export class MemoryStore implements GatewayStore {
  private admissions: Array<AdmissionRow & { tenant: string; pageId: string; subscriberId: string }> = []
  private batches = new Map<string, BatchRow>()
  private cursors = new Map<string, { revision: number; latestBatchId: string }>()
  private reservations = new Map<string, ReservationRow>()
  private chains = new Map<string, Promise<unknown>>()

  private contactKey(input: { tenant: string; pageId: string; subscriberId: string }): string {
    return `${input.tenant}|${input.pageId}|${input.subscriberId}`
  }

  private retireReservations(key: string, now: number) {
    for (const row of this.reservations.values()) {
      if (this.contactKey(row) === key && row.state === 'reserved') {
        row.state = 'superseded'
        row.finishedAt = now
      }
    }
  }

  private expireReservations(key: string, now: number) {
    for (const row of this.reservations.values()) {
      if (this.contactKey(row) === key && row.state === 'reserved' && now >= row.expiresAt) {
        row.state = 'expired'
        row.finishedAt = now
      }
    }
  }

  private bump(key: string, batchId: string): number {
    const current = this.cursors.get(key) ?? { revision: 0, latestBatchId: '' }
    const revision = current.revision + 1
    this.cursors.set(key, { revision, latestBatchId: batchId })
    return revision
  }

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
          unsentBatch: null,
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
      batch.deliverAfter = decision.deliverAfter
      batch.revision = this.bump(this.contactKey(input), batch.id)
      this.retireReservations(this.contactKey(input), input.now)
      const published = decision.publish ? await this.settle(batch, publish) : false
      this.admissions.push({
        tenant: input.tenant, pageId: input.pageId, subscriberId: input.subscriberId,
        eventKey: keys.eventKey, textKey: keys.textKey, counted: true, admittedAt: input.now,
      })
      return { reason: published === 'uncertain' ? 'accepted_queue_uncertain' : decision.reason, batchId: batch.id, publish: decision.publish }
    }
    const id = randomUUID()
    const folded = decision.type === 'succeed'
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
      revision: 0,
    }
    const cursorKey = this.contactKey(input)
    const previousCursor = this.cursors.get(cursorKey)
    row.revision = this.bump(cursorKey, id)
    row.lastInputText = folded ? decision.text : row.lastInputText
    row.messageCount = folded ? decision.messageCount : row.messageCount
    row.eventId = folded ? decision.eventId : row.eventId
    // The row stays invisible until publish returns, so a crash before the
    // insert does not leave an accepted batch with no queue message.
    const settled = await this.settle(row, publish)
    if (settled === 'rejected') {
      if (previousCursor) this.cursors.set(cursorKey, previousCursor)
      else this.cursors.delete(cursorKey)
      throw new PublishRejected()
    }
    if (folded) {
      const previous = this.batches.get(decision.previousId)
      if (previous && (previous.state === 'open' || previous.state === 'queued' || previous.state === 'sending')) {
        previous.state = 'superseded'
      }
    }
    this.retireReservations(cursorKey, input.now)
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
    const existing = this.batches.get(batchId)
    if (!existing) return { kind: 'missing' }
    return this.lock(this.contactKey(existing), () => {
      const batch = this.batches.get(batchId) ?? null
      if (!batch) return { kind: 'missing' }
      const cursor = this.cursors.get(this.contactKey(batch))
      if (cursor && (cursor.latestBatchId !== batch.id || cursor.revision !== batch.revision)) {
        if (batch.state === 'open' || batch.state === 'queued' || batch.state === 'sending') batch.state = 'superseded'
        return { kind: 'terminal' }
      }
      const decision = decideClaim(batch, now)
      if (decision.kind === 'crash_uncertain') {
        batch.state = 'uncertain'
        return { kind: 'crash_uncertain' }
      }
      if (decision.kind === 'send') {
        batch.state = 'sending'
        batch.deliveryAttemptedAt = now
        return { kind: 'send', batch: { ...batch, revision: batch.revision } }
      }
      if (decision.kind === 'defer') return decision
      return { kind: decision.kind }
    })
  }

  async confirmSend(batchId: string, now: number): Promise<{ ok: true; batch: ClaimBatch } | { ok: false }> {
    const existing = this.batches.get(batchId)
    if (!existing) return { ok: false }
    return this.lock(this.contactKey(existing), () => {
      const batch = this.batches.get(batchId)
      if (!batch || batch.state !== 'sending') return { ok: false }
      const cursor = this.cursors.get(this.contactKey(batch))
      if (!cursor || cursor.latestBatchId !== batch.id || cursor.revision !== batch.revision) {
        batch.state = 'superseded'
        return { ok: false }
      }
      void now
      return { ok: true, batch: { ...batch } }
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

  readReply(batchId: string, subscriberId: string | null, now: number): Promise<ReplyRead> {
    const peeked = this.batches.get(batchId)
    if (!peeked) return Promise.resolve({ kind: 'missing' })
    if (peeked.tenant !== TENANT || peeked.pageId !== PAGE_ID) return Promise.resolve({ kind: 'forbidden_scope' })
    if (subscriberId && subscriberId !== peeked.subscriberId) return Promise.resolve({ kind: 'forbidden_subscriber' })
    return this.lock(this.contactKey(peeked), () => {
      const batch = this.batches.get(batchId)
      if (!batch) return { kind: 'missing' as const }
      const key = this.contactKey(batch)
      this.expireReservations(key, now)
      const cursor = this.cursors.get(key)
      const reservation = [...this.reservations.values()].find(row => row.batchId === batch.id && row.revision === batch.revision) ?? null
      const currentRevision = cursor?.revision ?? 0
      const latestBatchId = cursor?.latestBatchId ?? null
      return {
        kind: 'ok' as const,
        batchId: batch.id,
        subscriberId: batch.subscriberId,
        batchRevision: batch.revision,
        currentRevision,
        latestBatchId,
        current: currentRevision === batch.revision && latestBatchId === batch.id,
        reservationState: reservation?.state ?? 'none',
        reservationId: reservation?.id ?? null,
      }
    })
  }

  claimReply(input: ReplyClaimInput): Promise<ReplyClaim> {
    const peeked = this.batches.get(input.batchId)
    if (!peeked) return Promise.resolve({ kind: 'missing' })
    if (peeked.tenant !== TENANT || peeked.pageId !== PAGE_ID) return Promise.resolve({ kind: 'forbidden_scope' })
    if (input.subscriberId && input.subscriberId !== peeked.subscriberId) return Promise.resolve({ kind: 'forbidden_subscriber' })
    return this.lock(this.contactKey(peeked), () => this.claimReplyLocked(input))
  }

  private claimReplyLocked(input: ReplyClaimInput): ReplyClaim {
    const batch = this.batches.get(input.batchId)
    if (!batch) return { kind: 'missing' }
    const key = this.contactKey(batch)
    this.expireReservations(key, input.now)
    const cursor = this.cursors.get(key)
    const currentRevision = cursor?.revision ?? 0
    const latestBatchId = cursor?.latestBatchId ?? null
    const byClaim = [...this.reservations.values()].find(row => row.claimId === input.claimId) ?? null
    if (byClaim) {
      if (byClaim.batchId !== batch.id || byClaim.revision !== input.revision || byClaim.subscriberId !== batch.subscriberId || byClaim.tenant !== batch.tenant || byClaim.pageId !== batch.pageId) {
        return { kind: 'claim_id_mismatch' }
      }
      return denyReservation(byClaim, batch, currentRevision, latestBatchId, true)
    }
    const byRevision = [...this.reservations.values()].find(row => row.tenant === batch.tenant && row.pageId === batch.pageId && row.subscriberId === batch.subscriberId && row.revision === input.revision) ?? null
    if (byRevision) return denyReservation(byRevision, batch, currentRevision, latestBatchId, false)
    if (!cursor || cursor.revision !== input.revision || cursor.latestBatchId !== batch.id || batch.revision !== input.revision) {
      return {
        kind: 'deny',
        reason: 'stale_revision',
        replay: false,
        reservationId: null,
        subscriberId: batch.subscriberId,
        batchId: batch.id,
        revision: input.revision,
        currentRevision,
        latestBatchId,
        expiresAt: null,
        outcome: null,
      }
    }
    if (batch.state === 'uncertain') {
      return {
        kind: 'deny',
        reason: 'wake_uncertain',
        replay: false,
        reservationId: null,
        subscriberId: batch.subscriberId,
        batchId: batch.id,
        revision: input.revision,
        currentRevision,
        latestBatchId,
        expiresAt: null,
        outcome: null,
      }
    }
    if (batch.state !== 'sending' && batch.state !== 'delivered') {
      return {
        kind: 'deny',
        reason: 'not_eligible',
        replay: false,
        reservationId: null,
        subscriberId: batch.subscriberId,
        batchId: batch.id,
        revision: input.revision,
        currentRevision,
        latestBatchId,
        expiresAt: null,
        outcome: null,
      }
    }
    const row: ReservationRow = {
      id: randomUUID(),
      tenant: batch.tenant,
      pageId: batch.pageId,
      subscriberId: batch.subscriberId,
      batchId: batch.id,
      revision: input.revision,
      claimId: input.claimId,
      state: 'reserved',
      finishId: null,
      reservedAt: input.now,
      expiresAt: input.now + RESERVATION_TTL_MS,
      finishedAt: null,
    }
    this.reservations.set(row.id, row)
    return {
      kind: 'grant',
      reservationId: row.id,
      subscriberId: batch.subscriberId,
      batchId: batch.id,
      revision: row.revision,
      claimId: row.claimId,
      expiresAt: row.expiresAt,
    }
  }

  finishReply(input: ReplyFinishInput): Promise<ReplyFinish> {
    const existing = this.reservations.get(input.reservationId)
    if (!existing) return Promise.resolve({ kind: 'missing' })
    if (existing.tenant !== TENANT || existing.pageId !== PAGE_ID) return Promise.resolve({ kind: 'forbidden_scope' })
    if (input.subscriberId && input.subscriberId !== existing.subscriberId) return Promise.resolve({ kind: 'forbidden_subscriber' })
    return this.lock(this.contactKey(existing), () => {
      const row = this.reservations.get(input.reservationId)
      if (!row) return { kind: 'missing' as const }
      if (row.batchId !== input.batchId || row.revision !== input.revision) return { kind: 'reservation_mismatch' as const }
      this.expireReservations(this.contactKey(row), input.now)
      if (row.state === 'sent' || row.state === 'not_sent' || row.state === 'unknown') {
        if (row.finishId === input.finishId && row.state === input.outcome) {
          return {
            kind: 'finished' as const,
            replay: true,
            outcome: input.outcome,
            reservationId: row.id,
            finishId: input.finishId,
            subscriberId: row.subscriberId,
            batchId: row.batchId,
            revision: row.revision,
          }
        }
        return { kind: 'finish_mismatch' as const, outcome: storedOutcome(row.state) }
      }
      if (row.state === 'expired') return { kind: 'closed' as const, error: 'expired' as const }
      if (row.state === 'superseded') return { kind: 'closed' as const, error: 'superseded' as const }
      const cursor = this.cursors.get(this.contactKey(row))
      if (!cursor || cursor.revision !== row.revision || cursor.latestBatchId !== row.batchId) {
        row.state = 'superseded'
        row.finishedAt = input.now
        return { kind: 'closed' as const, error: 'superseded' as const }
      }
      row.state = input.outcome
      row.finishId = input.finishId
      row.finishedAt = input.now
      return {
        kind: 'finished' as const,
        replay: false,
        outcome: input.outcome,
        reservationId: row.id,
        finishId: input.finishId,
        subscriberId: row.subscriberId,
        batchId: row.batchId,
        revision: row.revision,
      }
    })
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
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const record = current as { code?: string; message?: string; meta?: { code?: string }; cause?: unknown }
    if (record.code === '23505' || record.code === 'P2002' || record.meta?.code === '23505') return true
    const message = record.message ?? ''
    if (message.includes('23505') || message.includes('unique constraint') || message.includes('Unique constraint')) return true
    current = record.cause
  }
  return false
}

export function createSqlStore(db: Sql): GatewayStore {
  return {
    admit: (input, publish) => db.transaction(tx => admitSql(tx, input, publish)),
    markSchedule: (batchId, schedule, now) => markScheduleSql(db, batchId, schedule, now),
    claim: (batchId, now) => db.transaction(tx => claimSql(tx, batchId, now)),
    confirmSend: (batchId, now) => db.transaction(tx => confirmSendSql(tx, batchId, now)),
    readReply: (batchId, subscriberId, now) => db.transaction(tx => readReplySql(tx, batchId, subscriberId, now)),
    claimReply: async input => {
      try {
        return await db.transaction(tx => claimReplySql(tx, input))
      } catch (error) {
        // A unique violation aborts the Postgres transaction, so the loser
        // cannot read the winner in that same transaction. Roll back, then
        // read. This never inserts and never returns a grant.
        if (!isUnique(error)) throw error
        return db.transaction(tx => resolveClaimConflictSql(tx, input))
      }
    },
    finishReply: input => db.transaction(tx => finishReplySql(tx, input)),
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
    `SELECT "id", "lastInputText", "messageCount", "eventId", "scheduleState", "openedAt", "deliverAfter", "state"
     FROM "ManychatBatch"
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3
       AND "scheduleState" <> 'poisoned'
       AND "state" IN ('open', 'queued', 'sending')
     ORDER BY "openedAt" DESC
     LIMIT 1
     FOR UPDATE`,
    [input.tenant, input.pageId, input.subscriberId],
  )
  const open = openRows[0]
  const openedAt = open ? millis(open.openedAt) : 0
  const state = open ? String(open.state) : ''
  const asOpen: OpenBatch | null = open
    ? {
        id: String(open.id),
        lastInputText: String(open.lastInputText),
        messageCount: Number(open.messageCount),
        eventId: open.eventId == null ? null : String(open.eventId),
        scheduleState: String(open.scheduleState) as ScheduleState,
        openedAt,
        deliverAfter: millis(open.deliverAfter),
      }
    : null
  const joinable = asOpen != null && (state === 'open' || state === 'queued') && input.now < openedAt + MAX_BURST_MS
  const decision = decide({
    filterReason: input.filterReason,
    eventSeen: eventRows.length > 0,
    textSeen: textRows.length > 0,
    countedInWindow: Number(countRows[0]?.count ?? 0),
    openBatch: joinable ? asOpen : null,
    unsentBatch: !joinable ? asOpen : null,
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
    const revision = await bumpSql(tx, input, decision.batchId)
    await tx.query(
      `UPDATE "ManychatBatch"
       SET "lastInputText" = $2, "eventId" = $3, "messageCount" = $4, "deliverAfter" = $5::timestamptz,
           "revision" = $6, "updatedAt" = $7::timestamptz
       WHERE "id" = $1 AND "state" IN ('open', 'queued')`,
      [decision.batchId, decision.text, decision.eventId, decision.messageCount, stamp(decision.deliverAfter), revision, admittedAt],
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
  if (decision.type === 'succeed') {
    await tx.query(
      `UPDATE "ManychatBatch" SET "state" = 'superseded', "updatedAt" = $2::timestamptz
       WHERE "id" = $1 AND "state" IN ('open', 'queued', 'sending')`,
      [decision.previousId, admittedAt],
    )
  }
  const id = randomUUID()
  const revision = await bumpSql(tx, input, id)
  await tx.query(
    `INSERT INTO "ManychatBatch"
      ("id", "tenant", "pageId", "subscriberId", "state", "scheduleState", "openedAt", "deliverAfter", "lastInputText", "eventId", "messageCount", "updatedAt", "publishAttempts", "lastError", "revision")
     VALUES ($1, $2, $3, $4, 'open', 'pending', $5::timestamptz, $6::timestamptz, $7, $8, $9, $5::timestamptz, 0, NULL, $10)`,
    [id, input.tenant, input.pageId, input.subscriberId, admittedAt, stamp(deliverAfter(input.now)), decision.text, decision.eventId, decision.type === 'succeed' ? decision.messageCount : 1, revision],
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

async function bumpSql(tx: Sql, input: AdmitInput, batchId: string): Promise<number> {
  const rows = await tx.query(
    `UPDATE "ManychatSubscriberLock"
     SET "revision" = "revision" + 1, "latestBatchId" = $4
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3
     RETURNING "revision"`,
    [input.tenant, input.pageId, input.subscriberId, batchId],
  )
  const revision = Number(rows[0]?.revision ?? 0)
  if (!revision) throw new Error('subscriber_lock_missing')
  await tx.query(
    `UPDATE "ManychatReplyReservation"
     SET "state" = 'superseded', "finishedAt" = $4::timestamptz
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3 AND "state" = 'reserved'`,
    [input.tenant, input.pageId, input.subscriberId, stamp(input.now)],
  )
  return revision
}

function storedOutcome(state: string): ReplyFinishOutcome {
  if (state === 'sent' || state === 'not_sent' || state === 'unknown') return state
  return 'unknown'
}

function denyReservation(
  row: ReservationRow,
  batch: { id: string; subscriberId: string },
  currentRevision: number,
  latestBatchId: string | null,
  replay: boolean,
): ReplyClaim {
  const reason = row.state === 'reserved'
    ? 'already_reserved'
    : row.state === 'unknown'
      ? 'unknown_outcome'
      : row.state === 'expired'
        ? 'expired'
        : row.state === 'superseded'
          ? 'superseded'
          : 'already_finished'
  return {
    kind: 'deny',
    reason,
    replay,
    reservationId: replay ? row.id : null,
    subscriberId: batch.subscriberId,
    batchId: batch.id,
    revision: row.revision,
    currentRevision,
    latestBatchId,
    expiresAt: row.state === 'reserved' ? row.expiresAt : null,
    outcome: row.state === 'sent' || row.state === 'not_sent' || row.state === 'unknown' ? row.state : null,
  }
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

function batchFromRow(row: Record<string, unknown>): ClaimBatch {
  return {
    id: String(row.id),
    tenant: String(row.tenant),
    pageId: String(row.pageId),
    subscriberId: String(row.subscriberId),
    state: String(row.state),
    deliverAfter: millis(row.deliverAfter),
    deliveryAttemptedAt: row.deliveryAttemptedAt == null ? null : millis(row.deliveryAttemptedAt),
    lastInputText: String(row.lastInputText),
    eventId: row.eventId == null ? null : String(row.eventId),
    revision: Number(row.revision ?? 0),
  }
}

async function claimSql(tx: Sql, batchId: string, now: number): Promise<ClaimResult> {
  const peeked = await tx.query(
    `SELECT "tenant", "pageId", "subscriberId" FROM "ManychatBatch" WHERE "id" = $1`,
    [batchId],
  )
  if (!peeked[0]) return { kind: 'missing' }
  await tx.query(
    `SELECT 1 FROM "ManychatSubscriberLock"
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3
     FOR UPDATE`,
    [peeked[0].tenant, peeked[0].pageId, peeked[0].subscriberId],
  )
  const rows = await tx.query(
    `SELECT "id", "tenant", "pageId", "subscriberId", "state", "deliverAfter", "deliveryAttemptedAt", "lastInputText", "eventId", "revision"
     FROM "ManychatBatch" WHERE "id" = $1 FOR UPDATE`,
    [batchId],
  )
  const row = rows[0]
  if (!row) return { kind: 'missing' }
  const cursor = await tx.query(
    `SELECT "revision", "latestBatchId" FROM "ManychatSubscriberLock"
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3`,
    [row.tenant, row.pageId, row.subscriberId],
  )
  const latestId = cursor[0]?.latestBatchId == null ? '' : String(cursor[0].latestBatchId)
  const latestRevision = Number(cursor[0]?.revision ?? 0)
  if (latestId !== String(row.id) || latestRevision !== Number(row.revision ?? 0)) {
    await tx.query(
      `UPDATE "ManychatBatch" SET "state" = 'superseded', "updatedAt" = $2::timestamptz
       WHERE "id" = $1 AND "state" IN ('open', 'queued', 'sending')`,
      [batchId, stamp(now)],
    )
    return { kind: 'terminal' }
  }
  const batch: ClaimBatch = batchFromRow(row)
  const decision = decideClaim(batch, now)
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

async function confirmSendSql(tx: Sql, batchId: string, now: number): Promise<{ ok: true; batch: ClaimBatch } | { ok: false }> {
  const rows = await tx.query(
    `SELECT "id", "tenant", "pageId", "subscriberId", "state", "deliverAfter", "deliveryAttemptedAt", "lastInputText", "eventId", "revision"
     FROM "ManychatBatch" WHERE "id" = $1 FOR UPDATE`,
    [batchId],
  )
  const row = rows[0]
  if (!row || String(row.state) !== 'sending') return { ok: false }
  await tx.query(
    `SELECT 1 FROM "ManychatSubscriberLock"
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3 FOR UPDATE`,
    [row.tenant, row.pageId, row.subscriberId],
  )
  const cursor = await tx.query(
    `SELECT "revision", "latestBatchId" FROM "ManychatSubscriberLock"
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3`,
    [row.tenant, row.pageId, row.subscriberId],
  )
  const current = batchFromRow(row)
  const latestId = cursor[0]?.latestBatchId == null ? '' : String(cursor[0].latestBatchId)
  const latestRevision = Number(cursor[0]?.revision ?? 0)
  if (latestId !== current.id || latestRevision !== current.revision) {
    await tx.query(
      `UPDATE "ManychatBatch" SET "state" = 'superseded', "updatedAt" = $2::timestamptz
       WHERE "id" = $1 AND "state" = 'sending'`,
      [batchId, stamp(now)],
    )
    return { ok: false }
  }
  return { ok: true, batch: current }
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

function reservationFromRow(row: Record<string, unknown>): ReservationRow {
  const state = String(row.state)
  return {
    id: String(row.id),
    tenant: String(row.tenant),
    pageId: String(row.pageId),
    subscriberId: String(row.subscriberId),
    batchId: String(row.batchId),
    revision: Number(row.revision),
    claimId: String(row.claimId),
    state: state === 'sent' || state === 'not_sent' || state === 'unknown' || state === 'expired' || state === 'superseded' || state === 'reserved' ? state : 'unknown',
    finishId: row.finishId == null ? null : String(row.finishId),
    reservedAt: millis(row.reservedAt),
    expiresAt: millis(row.expiresAt),
    finishedAt: row.finishedAt == null ? null : millis(row.finishedAt),
  }
}

async function lockReplyContact(tx: Sql, tenant: string, pageId: string, subscriberId: string, now: number): Promise<{ revision: number; latestBatchId: string | null }> {
  await tx.query(
    `SELECT 1 FROM "ManychatSubscriberLock"
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3
     FOR UPDATE`,
    [tenant, pageId, subscriberId],
  )
  await tx.query(
    `UPDATE "ManychatReplyReservation"
     SET "state" = 'expired', "finishedAt" = $4::timestamptz
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3
       AND "state" = 'reserved' AND "expiresAt" <= $4::timestamptz`,
    [tenant, pageId, subscriberId, stamp(now)],
  )
  const cursor = await tx.query(
    `SELECT "revision", "latestBatchId" FROM "ManychatSubscriberLock"
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3`,
    [tenant, pageId, subscriberId],
  )
  return {
    revision: Number(cursor[0]?.revision ?? 0),
    latestBatchId: cursor[0]?.latestBatchId == null ? null : String(cursor[0].latestBatchId),
  }
}

async function readReplySql(tx: Sql, batchId: string, subscriberId: string | null, now: number): Promise<ReplyRead> {
  const peeked = await tx.query(
    `SELECT "id", "tenant", "pageId", "subscriberId", "revision" FROM "ManychatBatch" WHERE "id" = $1`,
    [batchId],
  )
  const row = peeked[0]
  if (!row) return { kind: 'missing' }
  if (String(row.tenant) !== TENANT || String(row.pageId) !== PAGE_ID) return { kind: 'forbidden_scope' }
  if (subscriberId && subscriberId !== String(row.subscriberId)) return { kind: 'forbidden_subscriber' }
  const cursor = await lockReplyContact(tx, String(row.tenant), String(row.pageId), String(row.subscriberId), now)
  const fresh = await tx.query(
    `SELECT "id", "subscriberId", "revision" FROM "ManychatBatch" WHERE "id" = $1 FOR UPDATE`,
    [batchId],
  )
  const batch = fresh[0]
  if (!batch) return { kind: 'missing' }
  const revision = Number(batch.revision)
  const held = await tx.query(
    `SELECT "id", "state" FROM "ManychatReplyReservation"
     WHERE "batchId" = $1 AND "revision" = $2`,
    [batchId, revision],
  )
  const rawState = held[0] ? String(held[0].state) : 'none'
  const reservationState = rawState === 'reserved' || rawState === 'sent' || rawState === 'not_sent' || rawState === 'unknown' || rawState === 'expired' || rawState === 'superseded' || rawState === 'none'
    ? rawState
    : 'none'
  return {
    kind: 'ok',
    batchId,
    subscriberId: String(batch.subscriberId),
    batchRevision: revision,
    currentRevision: cursor.revision,
    latestBatchId: cursor.latestBatchId,
    current: cursor.revision === revision && cursor.latestBatchId === batchId,
    reservationState,
    reservationId: held[0] ? String(held[0].id) : null,
  }
}

async function claimReplySql(tx: Sql, input: ReplyClaimInput): Promise<ReplyClaim> {
  const peeked = await tx.query(
    `SELECT "id", "tenant", "pageId", "subscriberId", "state", "revision" FROM "ManychatBatch" WHERE "id" = $1`,
    [input.batchId],
  )
  const row = peeked[0]
  if (!row) return { kind: 'missing' }
  if (String(row.tenant) !== TENANT || String(row.pageId) !== PAGE_ID) return { kind: 'forbidden_scope' }
  if (input.subscriberId && input.subscriberId !== String(row.subscriberId)) return { kind: 'forbidden_subscriber' }
  const cursor = await lockReplyContact(tx, String(row.tenant), String(row.pageId), String(row.subscriberId), input.now)
  const freshRows = await tx.query(
    `SELECT "id", "tenant", "pageId", "subscriberId", "state", "revision" FROM "ManychatBatch" WHERE "id" = $1 FOR UPDATE`,
    [input.batchId],
  )
  const batch = freshRows[0]
  if (!batch) return { kind: 'missing' }
  const batchView = { id: String(batch.id), subscriberId: String(batch.subscriberId) }
  const byClaimRows = await tx.query(`SELECT * FROM "ManychatReplyReservation" WHERE "claimId" = $1 FOR UPDATE`, [input.claimId])
  if (byClaimRows[0]) {
    const held = reservationFromRow(byClaimRows[0])
    if (held.batchId !== batchView.id || held.revision !== input.revision || held.subscriberId !== batchView.subscriberId || held.tenant !== String(batch.tenant) || held.pageId !== String(batch.pageId)) {
      return { kind: 'claim_id_mismatch' }
    }
    return denyReservation(held, batchView, cursor.revision, cursor.latestBatchId, true)
  }
  const byRevisionRows = await tx.query(
    `SELECT * FROM "ManychatReplyReservation"
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3 AND "revision" = $4
     FOR UPDATE`,
    [batch.tenant, batch.pageId, batch.subscriberId, input.revision],
  )
  if (byRevisionRows[0]) return denyReservation(reservationFromRow(byRevisionRows[0]), batchView, cursor.revision, cursor.latestBatchId, false)
  if (cursor.revision !== input.revision || cursor.latestBatchId !== batchView.id || Number(batch.revision) !== input.revision) {
    return {
      kind: 'deny',
      reason: 'stale_revision',
      replay: false,
      reservationId: null,
      subscriberId: batchView.subscriberId,
      batchId: batchView.id,
      revision: input.revision,
      currentRevision: cursor.revision,
      latestBatchId: cursor.latestBatchId,
      expiresAt: null,
      outcome: null,
    }
  }
  const state = String(batch.state)
  if (state === 'uncertain') {
    return {
      kind: 'deny',
      reason: 'wake_uncertain',
      replay: false,
      reservationId: null,
      subscriberId: batchView.subscriberId,
      batchId: batchView.id,
      revision: input.revision,
      currentRevision: cursor.revision,
      latestBatchId: cursor.latestBatchId,
      expiresAt: null,
      outcome: null,
    }
  }
  if (state !== 'sending' && state !== 'delivered') {
    return {
      kind: 'deny',
      reason: 'not_eligible',
      replay: false,
      reservationId: null,
      subscriberId: batchView.subscriberId,
      batchId: batchView.id,
      revision: input.revision,
      currentRevision: cursor.revision,
      latestBatchId: cursor.latestBatchId,
      expiresAt: null,
      outcome: null,
    }
  }
  const reservationId = randomUUID()
  const expiresAt = input.now + RESERVATION_TTL_MS
  await tx.query(
    `INSERT INTO "ManychatReplyReservation"
      ("id", "tenant", "pageId", "subscriberId", "batchId", "revision", "claimId", "state", "finishId", "reservedAt", "expiresAt", "finishedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'reserved', NULL, $8::timestamptz, $9::timestamptz, NULL)`,
    [reservationId, batch.tenant, batch.pageId, batch.subscriberId, batch.id, input.revision, input.claimId, stamp(input.now), stamp(expiresAt)],
  )
  return {
    kind: 'grant',
    reservationId,
    subscriberId: batchView.subscriberId,
    batchId: batchView.id,
    revision: input.revision,
    claimId: input.claimId,
    expiresAt,
  }
}

async function resolveClaimConflictSql(tx: Sql, input: ReplyClaimInput): Promise<ReplyClaim> {
  const peeked = await tx.query(
    `SELECT "id", "tenant", "pageId", "subscriberId" FROM "ManychatBatch" WHERE "id" = $1`,
    [input.batchId],
  )
  const row = peeked[0]
  if (!row) return { kind: 'missing' }
  if (String(row.tenant) !== TENANT || String(row.pageId) !== PAGE_ID) return { kind: 'forbidden_scope' }
  if (input.subscriberId && input.subscriberId !== String(row.subscriberId)) return { kind: 'forbidden_subscriber' }
  const cursor = await lockReplyContact(tx, String(row.tenant), String(row.pageId), String(row.subscriberId), input.now)
  const batchView = { id: String(row.id), subscriberId: String(row.subscriberId) }
  const byClaimRows = await tx.query(`SELECT * FROM "ManychatReplyReservation" WHERE "claimId" = $1 FOR UPDATE`, [input.claimId])
  if (byClaimRows[0]) {
    const held = reservationFromRow(byClaimRows[0])
    if (held.batchId !== batchView.id || held.revision !== input.revision || held.subscriberId !== batchView.subscriberId || held.tenant !== String(row.tenant) || held.pageId !== String(row.pageId)) {
      return { kind: 'claim_id_mismatch' }
    }
    return denyReservation(held, batchView, cursor.revision, cursor.latestBatchId, true)
  }
  const byRevisionRows = await tx.query(
    `SELECT * FROM "ManychatReplyReservation"
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3 AND "revision" = $4
     FOR UPDATE`,
    [row.tenant, row.pageId, row.subscriberId, input.revision],
  )
  if (byRevisionRows[0]) return denyReservation(reservationFromRow(byRevisionRows[0]), batchView, cursor.revision, cursor.latestBatchId, false)
  throw new Error('claim_conflict_unresolved')
}

async function finishReplySql(tx: Sql, input: ReplyFinishInput): Promise<ReplyFinish> {
  const peeked = await tx.query(`SELECT * FROM "ManychatReplyReservation" WHERE "id" = $1`, [input.reservationId])
  const first = peeked[0]
  if (!first) return { kind: 'missing' }
  if (String(first.tenant) !== TENANT || String(first.pageId) !== PAGE_ID) return { kind: 'forbidden_scope' }
  if (input.subscriberId && input.subscriberId !== String(first.subscriberId)) return { kind: 'forbidden_subscriber' }
  await lockReplyContact(tx, String(first.tenant), String(first.pageId), String(first.subscriberId), input.now)
  const rows = await tx.query(`SELECT * FROM "ManychatReplyReservation" WHERE "id" = $1 FOR UPDATE`, [input.reservationId])
  const row = rows[0] ? reservationFromRow(rows[0]) : null
  if (!row) return { kind: 'missing' }
  if (row.batchId !== input.batchId || row.revision !== input.revision) return { kind: 'reservation_mismatch' }
  if (row.state === 'sent' || row.state === 'not_sent' || row.state === 'unknown') {
    if (row.finishId === input.finishId && row.state === input.outcome) {
      return {
        kind: 'finished',
        replay: true,
        outcome: input.outcome,
        reservationId: row.id,
        finishId: input.finishId,
        subscriberId: row.subscriberId,
        batchId: row.batchId,
        revision: row.revision,
      }
    }
    return { kind: 'finish_mismatch', outcome: storedOutcome(row.state) }
  }
  if (row.state === 'expired') return { kind: 'closed', error: 'expired' }
  if (row.state === 'superseded') return { kind: 'closed', error: 'superseded' }
  const cursor = await tx.query(
    `SELECT "revision", "latestBatchId" FROM "ManychatSubscriberLock"
     WHERE "tenant" = $1 AND "pageId" = $2 AND "subscriberId" = $3`,
    [row.tenant, row.pageId, row.subscriberId],
  )
  const currentRevision = Number(cursor[0]?.revision ?? 0)
  const latestBatchId = cursor[0]?.latestBatchId == null ? null : String(cursor[0].latestBatchId)
  if (currentRevision !== row.revision || latestBatchId !== row.batchId) {
    await tx.query(
      `UPDATE "ManychatReplyReservation" SET "state" = 'superseded', "finishedAt" = $2::timestamptz
       WHERE "id" = $1 AND "state" = 'reserved'`,
      [row.id, stamp(input.now)],
    )
    return { kind: 'closed', error: 'superseded' }
  }
  await tx.query(
    `UPDATE "ManychatReplyReservation"
     SET "state" = $2, "finishId" = $3, "finishedAt" = $4::timestamptz
     WHERE "id" = $1 AND "state" = 'reserved'`,
    [row.id, input.outcome, input.finishId, stamp(input.now)],
  )
  return {
    kind: 'finished',
    replay: false,
    outcome: input.outcome,
    reservationId: row.id,
    finishId: input.finishId,
    subscriberId: row.subscriberId,
    batchId: row.batchId,
    revision: row.revision,
  }
}

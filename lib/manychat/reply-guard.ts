import { REPLY_GUARD_SECRET_ENV, TENANT } from '@/lib/manychat/constants'
import { authorized, readConfig } from '@/lib/manychat/policy'
import type { GatewayStore, ReplyClaim, ReplyFinish, ReplyFinishOutcome, ReplyRead } from '@/lib/manychat/store'

export type ReplyGuardAction = 'revision' | 'claim' | 'finish'

const BATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN_ID = /^[A-Za-z0-9_.:-]{8,128}$/
const SUBSCRIBER_ID = /^[0-9]{5,32}$/
const ALLOWED: Record<ReplyGuardAction, Set<string>> = {
  revision: new Set(['batch_id', 'subscriber_id', 'revision']),
  claim: new Set(['batch_id', 'revision', 'claim_id', 'subscriber_id']),
  finish: new Set(['batch_id', 'revision', 'reservation_id', 'finish_id', 'outcome', 'subscriber_id']),
}

export async function handleReplyGuard(
  action: ReplyGuardAction,
  body: unknown,
  authorization: string | null,
  deps: { env: NodeJS.ProcessEnv; now: () => number; db: GatewayStore; hostSlug?: string | null },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const config = readConfig(deps.env)
  if (!config.guardSecret) return closed(503, 'not_configured')
  if (!authorized(authorization, config.guardSecret)) return closed(401, 'unauthorized')
  if (deps.hostSlug && deps.hostSlug !== TENANT) return closed(403, 'forbidden_tenant')
  if (!config.enabled) return closed(403, 'disabled')
  const parsed = parseGuardBody(action, body)
  if (!parsed.ok) return closed(400, parsed.error)
  try {
    if (action === 'revision') return revisionBody(await deps.db.readReply(parsed.batchId, parsed.subscriberId, deps.now()))
    if (action === 'claim') {
      return claimBody(await deps.db.claimReply({
        batchId: parsed.batchId,
        revision: parsed.revision,
        claimId: parsed.claimId,
        subscriberId: parsed.subscriberId,
        now: deps.now(),
      }))
    }
    return finishBody(await deps.db.finishReply({
      batchId: parsed.batchId,
      revision: parsed.revision,
      reservationId: parsed.reservationId,
      finishId: parsed.finishId,
      outcome: parsed.outcome,
      subscriberId: parsed.subscriberId,
      now: deps.now(),
    }))
  } catch {
    return closed(503, 'unavailable')
  }
}

function closed(status: number, error: string): { status: number; body: Record<string, unknown> } {
  return { status, body: { ok: false, grant: false, error } }
}

type ParsedGuard =
  | { ok: false; error: string }
  | {
      ok: true
      batchId: string
      revision: number
      claimId: string
      reservationId: string
      finishId: string
      outcome: ReplyFinishOutcome
      subscriberId: string | null
    }

function parseGuardBody(action: ReplyGuardAction, body: unknown): ParsedGuard {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid_body' }
  const record = body as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!ALLOWED[action].has(key)) return { ok: false, error: 'untrusted_field' }
  }
  if (typeof record.batch_id !== 'string' || !BATCH_ID.test(record.batch_id)) return { ok: false, error: 'invalid_batch' }
  const subscriberId = record.subscriber_id == null ? null : record.subscriber_id
  if (subscriberId != null && (typeof subscriberId !== 'string' || !SUBSCRIBER_ID.test(subscriberId))) {
    return { ok: false, error: 'invalid_subscriber' }
  }
  const revision = record.revision == null ? 0 : record.revision
  if ((action !== 'revision' || record.revision != null) && !validRevision(revision)) {
    return { ok: false, error: 'invalid_revision' }
  }
  const claimId = typeof record.claim_id === 'string' ? record.claim_id : ''
  const reservationId = typeof record.reservation_id === 'string' ? record.reservation_id : ''
  const finishId = typeof record.finish_id === 'string' ? record.finish_id : ''
  const outcome = record.outcome
  if (action === 'claim' && !TOKEN_ID.test(claimId)) return { ok: false, error: 'invalid_claim' }
  if (action === 'finish') {
    if (!BATCH_ID.test(reservationId)) return { ok: false, error: 'invalid_reservation' }
    if (!TOKEN_ID.test(finishId)) return { ok: false, error: 'invalid_finish' }
    if (outcome !== 'sent' && outcome !== 'not_sent' && outcome !== 'unknown') return { ok: false, error: 'invalid_outcome' }
  }
  return {
    ok: true,
    batchId: record.batch_id,
    revision: validRevision(revision) ? revision : 0,
    claimId,
    reservationId,
    finishId,
    outcome: outcome === 'sent' || outcome === 'not_sent' || outcome === 'unknown' ? outcome : 'unknown',
    subscriberId,
  }
}

function validRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1_000_000_000
}

function revisionBody(result: ReplyRead): { status: number; body: Record<string, unknown> } {
  if (result.kind === 'missing') return closed(404, 'batch_not_found')
  if (result.kind === 'forbidden_scope') return closed(403, 'forbidden_scope')
  if (result.kind === 'forbidden_subscriber') return closed(403, 'forbidden_subscriber')
  return {
    status: 200,
    body: {
      ok: true,
      grant: false,
      reason: 'read',
      tenant: TENANT,
      subscriber_id: result.subscriberId,
      batch_id: result.batchId,
      batch_revision: result.batchRevision,
      current_revision: result.currentRevision,
      latest_batch_id: result.latestBatchId,
      current: result.current,
      reservation_state: result.reservationState,
      reservation_id: result.reservationId,
    },
  }
}

function claimBody(result: ReplyClaim): { status: number; body: Record<string, unknown> } {
  if (result.kind === 'missing') return closed(404, 'batch_not_found')
  if (result.kind === 'forbidden_scope') return closed(403, 'forbidden_scope')
  if (result.kind === 'forbidden_subscriber') return closed(403, 'forbidden_subscriber')
  if (result.kind === 'claim_id_mismatch') return closed(409, 'claim_id_mismatch')
  if (result.kind === 'grant') {
    return {
      status: 200,
      body: {
        ok: true,
        grant: true,
        reason: 'reserved',
        tenant: TENANT,
        subscriber_id: result.subscriberId,
        batch_id: result.batchId,
        revision: result.revision,
        reservation_id: result.reservationId,
        claim_id: result.claimId,
        expires_at: new Date(result.expiresAt).toISOString(),
        finish_binding: 'reservation_id',
      },
    }
  }
  return {
    status: 200,
    body: {
      ok: true,
      grant: false,
      reason: result.reason,
      replay: result.replay,
      tenant: TENANT,
      subscriber_id: result.subscriberId,
      batch_id: result.batchId,
      revision: result.revision,
      current_revision: result.currentRevision,
      latest_batch_id: result.latestBatchId,
      reservation_id: result.reservationId,
      expires_at: result.expiresAt == null ? null : new Date(result.expiresAt).toISOString(),
      outcome: result.outcome,
    },
  }
}

function finishBody(result: ReplyFinish): { status: number; body: Record<string, unknown> } {
  if (result.kind === 'missing') return closed(404, 'reservation_not_found')
  if (result.kind === 'forbidden_scope') return closed(403, 'forbidden_scope')
  if (result.kind === 'forbidden_subscriber') return closed(403, 'forbidden_subscriber')
  if (result.kind === 'reservation_mismatch') return closed(409, 'reservation_mismatch')
  if (result.kind === 'finish_mismatch') return { status: 409, body: { ok: false, grant: false, error: 'finish_mismatch', outcome: result.outcome } }
  if (result.kind === 'closed') return closed(409, result.error)
  return {
    status: 200,
    body: {
      ok: true,
      grant: false,
      reason: 'finished',
      replay: result.replay,
      outcome: result.outcome,
      tenant: TENANT,
      subscriber_id: result.subscriberId,
      batch_id: result.batchId,
      revision: result.revision,
      reservation_id: result.reservationId,
      finish_id: result.finishId,
    },
  }
}

export const REPLY_GUARD_SECRET_NAME = REPLY_GUARD_SECRET_ENV

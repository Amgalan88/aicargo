import { createHash } from 'crypto'
import { bearerMatches } from '@/lib/bot-auth'
import {
  COALESCE_MS,
  HOUR_MS,
  MAX_BURST_MS,
  IN_FLIGHT_MS,
  MAX_BATCH_TEXT,
  MAX_PER_HOUR,
  MAX_TEXT,
  PAGE_ID,
  PENDING_REPUBLISH_MS,
  REPLY_GUARD_SECRET_ENV,
  TENANT,
  TEXT_DEDUPE_MS,
} from '@/lib/manychat/constants'

export type FilterReason = 'empty' | 'sticker' | 'ack' | 'spam'
export type ScheduleState = 'pending' | 'enqueued' | 'failed' | 'poisoned'

const ACKS = new Set([
  'ok', 'okay', 'k', 'kk', 'thanks', 'thank you', 'thx', 'ty',
  'баярлалаа', 'за', 'за за', 'окей', 'ок', 'тийм',
])

export interface GatewayConfig {
  enabled: boolean
  secret: string
  webhookUrl: string
  webhookKey: string
  guardSecret: string
}

export function readConfig(env: NodeJS.ProcessEnv): GatewayConfig {
  return {
    enabled: env.MANYCHAT_GATEWAY_ENABLED?.trim() === 'true',
    secret: env.MANYCHAT_GATEWAY_SECRET?.trim() ?? '',
    webhookUrl: env.CARGO_SUPPORTER_WEBHOOK_URL?.trim() ?? '',
    webhookKey: env.CARGO_SUPPORTER_WEBHOOK_KEY?.trim() ?? '',
    guardSecret: env[REPLY_GUARD_SECRET_ENV]?.trim() ?? '',
  }
}

export function authorized(authorization: string | null | undefined, secret: string): boolean {
  return bearerMatches(authorization, secret)
}

export function validateWebhookUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return 'webhook_url'
  }
  if (url.protocol !== 'https:') return 'webhook_not_https'
  if (url.username || url.password) return 'webhook_userinfo'
  if (url.hash) return 'webhook_hash'
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return 'webhook_host'
  if (!host.includes('.') && !host.includes(':')) return 'webhook_host'
  if (isBlockedAddress(host)) return 'webhook_host'
  return null
}

function isBlockedAddress(host: string): boolean {
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const oct = v4.slice(1).map(Number)
    if (oct.some(n => n > 255)) return true
    const [a, b] = oct
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    return true
  }
  if (host.includes(':')) return true
  return false
}

export interface ParsedIngress {
  pageId: string
  subscriberId: string
  text: string
  eventId: string | null
}

export function parseIngressBody(body: unknown): { ok: true; value: ParsedIngress } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid_body' }
  const b = body as Record<string, unknown>
  if (b.tenant !== undefined && b.tenant !== TENANT) return { ok: false, error: 'forbidden_tenant' }
  const page = b.page_id ?? b.pageId
  if (page === undefined) return { ok: false, error: 'invalid_page' }
  if (typeof page !== 'string') return { ok: false, error: 'invalid_page' }
  if (page !== PAGE_ID) return { ok: false, error: 'forbidden_page' }
  const contact = b.contact_id ?? b.subscriber_id
  if (typeof contact !== 'string' || !/^[0-9]{5,32}$/.test(contact)) return { ok: false, error: 'invalid_subscriber' }
  if (typeof b.text !== 'string') return { ok: false, error: 'invalid_body' }
  if (b.text.length > MAX_TEXT) return { ok: false, error: 'text_too_long' }
  let eventId: string | null = null
  if (b.event_id !== undefined && b.event_id !== null) {
    if (typeof b.event_id !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(b.event_id)) {
      return { ok: false, error: 'invalid_event' }
    }
    eventId = b.event_id
  }
  return { ok: true, value: { pageId: page, subscriberId: contact, text: b.text.trim(), eventId } }
}

export function filterText(text: string): FilterReason | null {
  if (!text) return 'empty'
  if (isSticker(text)) return 'sticker'
  if (isSpam(text)) return 'spam'
  if (isAck(text)) return 'ack'
  return null
}

function isAck(text: string): boolean {
  const n = text.toLowerCase().replace(/[!.,…~]+/g, '').replace(/\s+/g, ' ').trim()
  return ACKS.has(n)
}

const HAS_LETTER_OR_NUMBER = new RegExp('[\\p{L}\\p{N}]', 'u')

function isSticker(text: string): boolean {
  if (/^(?:sticker|\[sticker\]|\(sticker\)|<sticker>)$/i.test(text)) return true
  return !HAS_LETTER_OR_NUMBER.test(text)
}

function isSpam(text: string): boolean {
  return /(.)\1{19,}/u.test(text)
}

export function eventKey(pageId: string, eventId: string): string {
  return `evt:${TENANT}:${pageId}:${eventId}`
}

export function textKey(pageId: string, subscriberId: string, text: string): string {
  const hash = createHash('sha256').update(text).digest('hex')
  return `txt:${TENANT}:${pageId}:${subscriberId}:${hash}`
}

export function coalesceText(prev: string, next: string): string {
  const joined = prev ? `${prev}\n${next}` : next
  return joined.length <= MAX_BATCH_TEXT ? joined : joined.slice(joined.length - MAX_BATCH_TEXT)
}

export interface OpenBatch {
  id: string
  lastInputText: string
  messageCount: number
  eventId: string | null
  scheduleState: ScheduleState
  openedAt: number
  deliverAfter: number
}

// Null when `now` is already at the 8s cap. Otherwise the next wake time:
// 5s after this fragment, but not later than the cap and not earlier than
// the deadline already promised.
export function quietDeadline(openedAt: number, currentDeliverAfter: number, now: number): number | null {
  const cap = openedAt + MAX_BURST_MS
  if (now >= cap) return null
  return Math.min(cap, Math.max(currentDeliverAfter, now + COALESCE_MS))
}

export type Decision =
  | { type: 'duplicate' }
  | { type: 'record'; counted: false; reason: string }
  | { type: 'create'; reason: 'queued'; text: string; eventId: string | null }
  | { type: 'join'; batchId: string; reason: 'queued' | 'coalesced'; publish: boolean; text: string; eventId: string | null; messageCount: number; deliverAfter: number }
  | { type: 'succeed'; previousId: string; reason: 'queued'; text: string; eventId: string | null; messageCount: number }

export function decide(input: {
  filterReason: FilterReason | null
  eventSeen: boolean
  textSeen: boolean
  countedInWindow: number
  openBatch: OpenBatch | null
  unsentBatch: OpenBatch | null
  now: number
  text: string
  eventId: string | null
}): Decision {
  if (input.filterReason) {
    if (input.eventSeen) return { type: 'duplicate' }
    return { type: 'record', counted: false, reason: `filtered_${input.filterReason}` }
  }
  if (input.eventSeen || input.textSeen) return { type: 'duplicate' }
  if (input.countedInWindow >= MAX_PER_HOUR) return { type: 'record', counted: false, reason: 'rate_limited' }
  if (input.openBatch) {
    const deadline = quietDeadline(input.openBatch.openedAt, input.openBatch.deliverAfter, input.now)
    if (deadline != null) {
      const age = input.now - input.openBatch.openedAt
      const publish = input.openBatch.scheduleState === 'failed'
        || (input.openBatch.scheduleState === 'pending' && age >= PENDING_REPUBLISH_MS)
      return {
        type: 'join',
        batchId: input.openBatch.id,
        reason: publish ? 'queued' : 'coalesced',
        publish,
        text: coalesceText(input.openBatch.lastInputText, input.text),
        eventId: input.eventId ?? input.openBatch.eventId,
        messageCount: input.openBatch.messageCount + 1,
        deliverAfter: deadline,
      }
    }
  }
  if (input.unsentBatch) {
    return {
      type: 'succeed',
      previousId: input.unsentBatch.id,
      reason: 'queued',
      text: coalesceText(input.unsentBatch.lastInputText, input.text),
      eventId: input.eventId ?? input.unsentBatch.eventId,
      messageCount: input.unsentBatch.messageCount + 1,
    }
  }
  return { type: 'create', reason: 'queued', text: input.text, eventId: input.eventId }
}

export interface ClaimBatch {
  id: string
  tenant: string
  pageId: string
  subscriberId: string
  state: string
  deliverAfter: number
  deliveryAttemptedAt: number | null
  lastInputText: string
  eventId: string | null
  revision: number
}

export type ClaimDecision =
  | { kind: 'missing' }
  | { kind: 'terminal' }
  | { kind: 'in_flight' }
  | { kind: 'reject_scope' }
  | { kind: 'crash_uncertain' }
  | { kind: 'defer'; afterSeconds: number }
  | { kind: 'send' }

export function decideClaim(batch: ClaimBatch | null, now: number): ClaimDecision {
  if (!batch) return { kind: 'missing' }
  if (batch.tenant !== TENANT || batch.pageId !== PAGE_ID) return { kind: 'reject_scope' }
  if (batch.state === 'delivered' || batch.state === 'uncertain' || batch.state === 'suppressed' || batch.state === 'superseded') return { kind: 'terminal' }
  if (batch.state === 'sending') {
    const age = now - (batch.deliveryAttemptedAt ?? 0)
    return age < IN_FLIGHT_MS ? { kind: 'in_flight' } : { kind: 'crash_uncertain' }
  }
  if (batch.state !== 'open' && batch.state !== 'queued') return { kind: 'terminal' }
  if (now < batch.deliverAfter) {
    const afterSeconds = Math.min(8, Math.max(1, Math.ceil((batch.deliverAfter - now) / 1000)))
    return { kind: 'defer', afterSeconds }
  }
  return { kind: 'send' }
}

export function windowStart(now: number): number {
  return now - HOUR_MS
}

export function textWindowStart(now: number): number {
  return now - TEXT_DEDUPE_MS
}

export function deliverAfter(now: number): number {
  return now + COALESCE_MS
}

export { HOUR_MS, TEXT_DEDUPE_MS }

export const TENANT = 'darkhan'
export const PAGE_ID = '413037705220679'
export const TOPIC = 'manychat-gateway-wake'
export const QUEUE_REGION = 'bom1' as const

// Quiet period after the latest fragment. A later fragment pushes the wake
// forward, but never past MAX_BURST_MS from the first fragment of this burst.
export const COALESCE_SECONDS = 5
export const COALESCE_MS = COALESCE_SECONDS * 1000
export const MAX_BURST_MS = 8_000
export const MAX_PER_HOUR = 10
export const HOUR_MS = 60 * 60 * 1000
// Used only when ManyChat does not send a stable event_id. Identical trimmed
// text inside this window is one admission. It is not a substitute for an
// event id: a retry whose text changed, or that arrives after the window, is
// a new message. The gateway never invents an event id.
export const TEXT_DEDUPE_MS = 2 * 60 * 1000
export const MAX_TEXT = 1000
export const MAX_BATCH_TEXT = 4000
export const RETENTION_SECONDS = 3600
export const IN_FLIGHT_MS = 60_000
export const PENDING_REPUBLISH_MS = 1000
// Sweeper waits until the 5s delay should already have been delivered.
// Vercel Cron cannot run inside this window (Pro minimum is one minute,
// Hobby is once a day), so this grace is only the eligibility rule.
export const SWEEP_GRACE_MS = 15_000
export const MAX_PUBLISH_ATTEMPTS = 5
export const MAX_WAKE_DELIVERIES = 8
export const MISSING_BATCH_DEFERS = 3
export const PUBLISH_TIMEOUT_MS = 4_000
// A reply reservation that is never finished stops authorizing a customer send.
// Expiry is checked under the subscriber lock. It does not start a new grant.
export const RESERVATION_TTL_MS = 120_000
export const REPLY_GUARD_SECRET_ENV = 'MANYCHAT_REPLY_GUARD_SECRET'

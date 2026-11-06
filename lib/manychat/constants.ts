export const TENANT = 'darkhan'
export const PAGE_ID = '413037705220679'
export const TOPIC = 'manychat-gateway-wake'
export const QUEUE_REGION = 'bom1' as const

// Inside the required 3–8 second coalesce window. Anchored to the first
// message of a burst; later messages do not extend it.
export const COALESCE_SECONDS = 5
export const COALESCE_MS = COALESCE_SECONDS * 1000
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

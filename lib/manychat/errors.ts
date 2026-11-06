export class PublishRejected extends Error {
  constructor() {
    super('publish_rejected')
    this.name = 'PublishRejected'
  }
}

export class PublishUncertain extends Error {
  constructor() {
    super('publish_uncertain')
    this.name = 'PublishUncertain'
  }
}

export class DeferWake extends Error {
  constructor(readonly afterSeconds: number, readonly purpose: 'early' | 'inflight' | 'missing') {
    super('defer')
    this.name = 'DeferWake'
  }
}

export class RetryableWake extends Error {
  constructor(readonly reason: string) {
    super(reason)
    this.name = 'RetryableWake'
  }
}

export class TerminalWake extends Error {
  constructor(readonly reason: string) {
    super(reason)
    this.name = 'TerminalWake'
  }
}

const REJECTED_NAMES = new Set([
  'PublishRejected',
  'BadRequestError',
  'ForbiddenError',
  'PayloadTooLargeError',
])

// A client timeout or a dropped connection can happen after the queue accepted
// the send. Only named client errors that never reach a durable accept are rejected.
export function classifyPublishError(error: unknown): 'rejected' | 'uncertain' {
  const name = error instanceof Error ? error.name : ''
  return REJECTED_NAMES.has(name) ? 'rejected' : 'uncertain'
}

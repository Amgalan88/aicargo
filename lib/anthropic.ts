// Админы AI туслахын Claude клиент. Түлхүүр: ANTHROPIC_API_KEY (Vercel болон .env.local).
// Түлхүүргүй үед null буцаана: туслах кодоор ажилласаар, чөлөөт асуулт л унтарна.
import Anthropic from '@anthropic-ai/sdk'

export const ADMIN_AI_MODEL = 'claude-haiku-5-5'

let client: Anthropic | null = null

export function anthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim()
}

export function getAnthropic(): Anthropic | null {
  if (!anthropicConfigured()) return null
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim(), maxRetries: 2, timeout: 30_000 })
  return client
}

// AI туслахын зардлын хамгаалалт (Upstash Redis): админ өдөрт DAILY_QUESTIONS асуулт,
// сарын нийт зардал ба каргон бүрийн сарын зардал хязгаартай. Redis ажиллахгүй бол хүсэлтийг хаахгүй.
import { Redis } from '@upstash/redis'

export const DAILY_QUESTIONS = 30
const MONTHLY_USD = Number(process.env.ASSISTANT_MONTHLY_USD) || 30
const CARGO_MONTHLY_USD = Number(process.env.ASSISTANT_CARGO_MONTHLY_USD) || 5

// Claude Haiku 5.5 (prompt ≤100K токен), $ / 1M токен
const PRICE = { input: 0.10, output: 0.50, cacheWrite: 0.125, cacheRead: 0.01 }

export type Usage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null }
export function usageUsd(u: Usage): number {
  return (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output
    + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) / 1e6
}

const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN
const redis = url && token ? new Redis({ url, token }) : null
const ub = (now: Date) => new Date(now.getTime() + 8 * 3600_000).toISOString()

export async function reserveQuestion(userId: number, cargoId: number, now = new Date()): Promise<{ ok: true; remaining: number } | { ok: false; error: string }> {
  if (!redis) return { ok: true, remaining: DAILY_QUESTIONS }
  try {
    const month = ub(now).slice(0, 7)
    const [total, cargo] = await Promise.all([redis.get<number>(`asst:usd:${month}`), redis.get<number>(`asst:usd:${cargoId}:${month}`)])
    if (Number(total ?? 0) >= MONTHLY_USD || Number(cargo ?? 0) >= CARGO_MONTHLY_USD) {
      return { ok: false, error: 'Энэ сарын AI асуултын эрх дууслаа. Бэлэн асуултууд ажилласаар байна.' }
    }
    const dayKey = `asst:q:${userId}:${ub(now).slice(0, 10)}`
    const used = await redis.incr(dayKey)
    if (used === 1) await redis.expire(dayKey, 2 * 86_400)
    if (used > DAILY_QUESTIONS) return { ok: false, error: `Өнөөдрийн ${DAILY_QUESTIONS} асуултын эрх дууслаа. Маргааш дахин асуугаарай. Бэлэн асуултууд ажилласаар байна.` }
    return { ok: true, remaining: DAILY_QUESTIONS - used }
  } catch (e) {
    console.error('[assistant-budget] reserve', e)
    return { ok: true, remaining: DAILY_QUESTIONS }
  }
}

export async function recordSpend(cargoId: number, usd: number, now = new Date()) {
  if (!redis || !(usd > 0)) return
  try {
    const month = ub(now).slice(0, 7)
    for (const key of [`asst:usd:${month}`, `asst:usd:${cargoId}:${month}`]) {
      await redis.incrbyfloat(key, usd)
      await redis.expire(key, 40 * 86_400)
    }
  } catch (e) {
    console.error('[assistant-budget] record', e)
  }
}

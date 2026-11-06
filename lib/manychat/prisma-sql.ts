import { prisma } from '@/lib/prisma'
import type { Sql } from '@/lib/manychat/store'

type Raw = (text: string, params: unknown[]) => Promise<unknown>

export function prismaSql(): Sql {
  const bind = (query: Raw): Sql => ({
    query: async (text, params = []) => (await query(text, params)) as Array<Record<string, unknown>>,
    transaction: fn => fn(bind(query)),
  })
  return {
    query: async (text, params = []) => (await prisma.$queryRawUnsafe(text, ...params)) as Array<Record<string, unknown>>,
    transaction: fn => prisma.$transaction(async tx => fn(bind(
      (text, params) => tx.$queryRawUnsafe(text, ...params),
    ))),
  }
}

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { splitSql } from './split-sql'

// DDL must use the direct connection. The transaction pooler (port 6543, or
// *.pooler.supabase.com) rejects or silently mishandles event triggers.
function connectionString(): string {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url) {
    throw new Error('Set DIRECT_URL or DATABASE_URL to the direct Postgres connection (port 5432, not the pooler).')
  }
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('pooler.supabase.com') || parsed.port === '6543') {
      throw new Error('Refusing the Supabase pooler. Use the direct connection (db.<project-ref>.supabase.co, port 5432).')
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Refusing')) throw error
  }
  return url
}

export async function runSqlFile(filePath: string): Promise<number> {
  const statements = splitSql(readFileSync(filePath, 'utf8'))
  if (statements.length === 0) throw new Error(`No SQL statements in ${filePath}`)

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString() }) } as any)
  try {
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].replace(/;+\s*$/, '')
      try {
        await prisma.$executeRawUnsafe(`${statement};`)
      } catch (error) {
        const preview = statement.replace(/\s+/g, ' ').slice(0, 180)
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Statement ${i + 1}/${statements.length} failed (${preview}): ${message}`)
      }
    }
  } finally {
    await prisma.$disconnect()
  }
  return statements.length
}

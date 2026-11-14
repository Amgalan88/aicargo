// npx tsx --env-file=.env.local scripts/add-manychat-gateway.ts
// ManyChat PRE-AI gateway tables. Idempotent (IF NOT EXISTS). Safe to re-run.
// Do not run against production until the owner applies it on purpose, before enabling MANYCHAT_GATEWAY_ENABLED.
// Rollback (separate, not run here): scripts/sql/2026-11-manychat-gateway-rollback.sql
import { prisma } from '../lib/prisma'
import { manychatMigrationSql, sqlStatements } from './manychat-ddl'

async function main() {
  const statements = sqlStatements(manychatMigrationSql())
  for (const sql of statements) await prisma.$executeRawUnsafe(sql)
  console.log(`OK: manychat gateway schema ready (${statements.length} statements)`)
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('Алдаа:', e); process.exit(1) })

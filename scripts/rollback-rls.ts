// npx tsx --env-file=.env.local scripts/rollback-rls.ts
// enable-rls-ийг буцаана: RLS унтрааж, anon/authenticated эрхийг буцааж олгоно. Нэг удаа.
// aicargo_rls_guard суугаагүй бол юу ч өөрчлөхгүй. SQL: scripts/sql/rollback-rls.sql
import { resolve } from 'node:path'
import { runSqlFile } from './run-sql-file'

async function main() {
  const n = await runSqlFile(resolve(__dirname, 'sql/rollback-rls.sql'))
  console.log(`OK: RLS rollback applied (${n} statements)`)
}

main().catch(error => {
  console.error('Алдаа:', error instanceof Error ? error.message : error)
  process.exit(1)
})

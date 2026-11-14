// npx tsx --env-file=.env.local scripts/enable-rls.ts
// Бүх public хүснэгтэд RLS (policy-гүй) + anon/authenticated эрх хасах. Давтан ажиллуулж болно.
// Зөвхөн шууд холболт (DIRECT_URL, порт 5432). Pooler (6543 / pooler.supabase.com) дээр ажиллахгүй.
// SQL editor / psql: scripts/sql/enable-rls.sql. Буцаалт: scripts/rollback-rls.ts
import { resolve } from 'node:path'
import { runSqlFile } from './run-sql-file'

async function main() {
  const n = await runSqlFile(resolve(__dirname, 'sql/enable-rls.sql'))
  console.log(`OK: RLS enabled (${n} statements)`)
}

main().catch(error => {
  console.error('Алдаа:', error instanceof Error ? error.message : error)
  process.exit(1)
})

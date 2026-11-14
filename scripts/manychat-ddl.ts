// Statement splitter for the ManyChat gateway migration. No database client.
// scripts/add-manychat-gateway.ts is the operator entrypoint. Tests apply the
// same statements to embedded Postgres only.

import { readFileSync } from 'node:fs'

const MIGRATION = new URL('../prisma/migrations/20261106120000_manychat_gateway/migration.sql', import.meta.url)
const ROLLBACK = new URL('./sql/2026-11-manychat-gateway-rollback.sql', import.meta.url)

export function sqlStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
}

export function manychatMigrationSql(): string {
  return readFileSync(MIGRATION, 'utf8')
}

export function manychatRollbackSql(): string {
  return readFileSync(ROLLBACK, 'utf8')
}

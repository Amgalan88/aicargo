// npx tsx scripts/add-staff-admin-audit-log.ts
// DATABASE_URL тохируулаад ажиллуулна (pooled connection дээр prisma db push/migrate living тул
// raw DDL-ээр гараар хийнэ — scripts/seed-demo.ts-тэй адил дүрэм).
import { prisma } from '../lib/prisma'

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isStaffAdmin" BOOLEAN NOT NULL DEFAULT false`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canEditBank" BOOLEAN NOT NULL DEFAULT false`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canEditAddress" BOOLEAN NOT NULL DEFAULT false`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canEditLogo" BOOLEAN NOT NULL DEFAULT false`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
      "id" SERIAL NOT NULL,
      "cargoId" INTEGER NOT NULL,
      "userId" INTEGER NOT NULL,
      "userName" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "detail" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "AdminAuditLog_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AdminAuditLog_cargoId_createdAt_idx" ON "AdminAuditLog"("cargoId", "createdAt")`)

  console.log('OK: isStaffAdmin/canEdit* columns + AdminAuditLog table ready')
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('Алдаа:', e); process.exit(1) })

// npx tsx --env-file=.env.local scripts/add-warehouse-log.ts
// DATABASE_URL тохируулаад ажиллуулна (pooled connection дээр prisma db push/migrate living тул
// raw DDL-ээр гараар хийнэ — scripts/add-warehouse-profile-gallery.ts-тэй адил дүрэм).
import { prisma } from '../lib/prisma'

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WarehouseLog" (
      "id" SERIAL NOT NULL,
      "warehouseId" INTEGER NOT NULL,
      "userId" INTEGER NOT NULL,
      "userName" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "detail" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WarehouseLog_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "WarehouseLog_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "PartnerWarehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WarehouseLog_warehouseId_createdAt_idx" ON "WarehouseLog"("warehouseId", "createdAt")`)

  console.log('OK: WarehouseLog table ready')
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('Алдаа:', e); process.exit(1) })

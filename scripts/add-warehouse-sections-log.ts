// npx tsx --env-file=.env.local scripts/add-warehouse-sections-log.ts
// DATABASE_URL тохируулаад ажиллуулна (pooled connection дээр prisma db push/migrate living тул
// raw DDL-ээр гараар хийнэ — scripts/add-warehouse-profile-gallery.ts-тэй адил дүрэм).
import { prisma } from '../lib/prisma'

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WarehouseSection" (
      "id" SERIAL NOT NULL,
      "warehouseId" INTEGER NOT NULL,
      "code" TEXT NOT NULL,
      "note" TEXT,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WarehouseSection_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "WarehouseSection_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "PartnerWarehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "WarehouseSection_warehouseId_code_key" ON "WarehouseSection"("warehouseId", "code")`)

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

  console.log('OK: WarehouseSection + WarehouseLog tables ready')
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('Алдаа:', e); process.exit(1) })

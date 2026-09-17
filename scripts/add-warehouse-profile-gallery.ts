// npx tsx scripts/add-warehouse-profile-gallery.ts
// DATABASE_URL тохируулаад ажиллуулна (pooled connection дээр prisma db push/migrate living тул
// raw DDL-ээр гараар хийнэ — scripts/add-staff-admin-audit-log.ts-тэй адил дүрэм).
import { prisma } from '../lib/prisma'

const COLUMNS: [string, string][] = [
  ['slug', 'TEXT'],
  ['legalNameMn', 'TEXT'],
  ['legalNameCn', 'TEXT'],
  ['registerNo', 'TEXT'],
  ['directorName', 'TEXT'],
  ['bankName', 'TEXT'],
  ['bankAccount', 'TEXT'],
  ['bankHolder', 'TEXT'],
  ['contractFee', 'DECIMAL(12,2) NOT NULL DEFAULT 1200000'],
  ['services', 'TEXT'],
  ['pricePerTonCny', 'DECIMAL(12,2)'],
  ['pricePerM3Cny', 'DECIMAL(12,2)'],
  ['acceptingContracts', 'BOOLEAN NOT NULL DEFAULT true'],
]

async function main() {
  for (const [name, type] of COLUMNS) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "PartnerWarehouse" ADD COLUMN IF NOT EXISTS "${name}" ${type}`)
  }
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PartnerWarehouse_slug_key" ON "PartnerWarehouse"("slug")`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WarehouseImage" (
      "id" SERIAL NOT NULL,
      "warehouseId" INTEGER NOT NULL,
      "url" TEXT NOT NULL,
      "publicId" TEXT NOT NULL,
      "caption" TEXT,
      "category" TEXT NOT NULL DEFAULT 'GENERAL',
      "order" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WarehouseImage_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "WarehouseImage_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "PartnerWarehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WarehouseImage_warehouseId_order_idx" ON "WarehouseImage"("warehouseId", "order")`)

  console.log('OK: PartnerWarehouse profile columns + WarehouseImage table ready')
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('Алдаа:', e); process.exit(1) })

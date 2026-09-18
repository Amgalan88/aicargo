// npx tsx --env-file=.env.local scripts/add-warehouse-receive-address.ts
// Агуулахын ачаа хүлээн авах хаяг + гэрээгээр олгох каргогийн тэмдэг (raw DDL — add-warehouse-profile-gallery.ts-тэй адил дүрэм)
import { prisma } from '../lib/prisma'

async function main() {
  for (const col of ['receiveRegion', 'receiveAddress', 'receivePhone']) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "PartnerWarehouse" ADD COLUMN IF NOT EXISTS "${col}" TEXT`)
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE "WarehouseContract" ADD COLUMN IF NOT EXISTS "cargoMark" TEXT`)
  // Нэг агуулахад хүчинтэй гэрээнүүдийн тэмдэг давхцахгүй — агуулах ачааг тэмдгээр ялгана
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "WarehouseContract_warehouseId_cargoMark_live_key"
    ON "WarehouseContract"("warehouseId", UPPER("cargoMark"))
    WHERE "cargoMark" IS NOT NULL AND "status" IN ('ACTIVE', 'TERMINATION_PENDING')
  `)
  console.log('OK: receive address columns + cargoMark ready')
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('Алдаа:', e); process.exit(1) })

// npx tsx --env-file=.env.local scripts/add-guest-contracts.ts
// Нэвтрэлтгүй (зочны) гэрээ: cargoId-г заавал биш болгож, и-мэйл + нууц холбоосын талбар нэмнэ
import { prisma } from '../lib/prisma'

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE "WarehouseContract" ALTER COLUMN "cargoId" DROP NOT NULL`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "WarehouseContract" ALTER COLUMN "createdById" DROP NOT NULL`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "WarehouseContract" ADD COLUMN IF NOT EXISTS "guestEmail" TEXT`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "WarehouseContract" ADD COLUMN IF NOT EXISTS "accessToken" TEXT`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "WarehouseContract_accessToken_key" ON "WarehouseContract"("accessToken")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WarehouseContract_guestEmail_idx" ON "WarehouseContract"("guestEmail")`)
  // Нэг и-мэйл × нэг агуулах хооронд зэрэг нэг л амьд зочны гэрээ
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "WarehouseContract_one_open_per_guest"
    ON "WarehouseContract"("guestEmail", "warehouseId")
    WHERE "cargoId" IS NULL AND "status" NOT IN ('TERMINATED', 'REJECTED')
  `)
  // Гэрээ нь карго эсвэл зочны аль нэгэнд заавал хамаарна
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "WarehouseContract" ADD CONSTRAINT "WarehouseContract_owner_check"
        CHECK ("cargoId" IS NOT NULL OR ("guestEmail" IS NOT NULL AND "accessToken" IS NOT NULL));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `)
  console.log('OK: guest contract columns ready')
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('Алдаа:', e); process.exit(1) })

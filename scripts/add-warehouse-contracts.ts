// npx tsx --env-file=.env.local scripts/add-warehouse-contracts.ts
// DATABASE_URL тохируулаад ажиллуулна (pooled connection дээр prisma db push/migrate living тул
// raw DDL-ээр гараар хийнэ — scripts/add-warehouse-log.ts-тэй адил дүрэм).
import { prisma } from '../lib/prisma'

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE "PartnerWarehouse" ADD COLUMN IF NOT EXISTS "pricePerKgMnt" DECIMAL(12,2)`)

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ContractStatus" AS ENUM (
        'DRAFT', 'AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'ACTIVE',
        'TERMINATION_PENDING', 'TERMINATED', 'REJECTED'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ContractTemplate" (
      "id" SERIAL NOT NULL,
      "warehouseId" INTEGER NOT NULL,
      "version" INTEGER NOT NULL,
      "titleMn" TEXT NOT NULL,
      "titleCn" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "createdBy" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ContractTemplate_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "PartnerWarehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ContractTemplate_warehouseId_version_key" ON "ContractTemplate"("warehouseId", "version")`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WarehouseContract" (
      "id" SERIAL NOT NULL,
      "contractNo" TEXT NOT NULL,
      "warehouseId" INTEGER NOT NULL,
      "cargoId" INTEGER NOT NULL,
      "templateId" INTEGER NOT NULL,
      "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
      "values" TEXT NOT NULL DEFAULT '{}',
      "renderedBody" TEXT,
      "bodyHash" TEXT,
      "fee" DECIMAL(12,2) NOT NULL,
      "payToBank" TEXT,
      "payToAccount" TEXT,
      "payToHolder" TEXT,
      "paymentProofUrl" TEXT,
      "paymentNote" TEXT,
      "paymentClaimedAt" TIMESTAMP(3),
      "paidAt" TIMESTAMP(3),
      "cargoSignedAt" TIMESTAMP(3),
      "cargoSignerId" INTEGER,
      "cargoSignerName" TEXT,
      "cargoSignerEmail" TEXT,
      "cargoSignIp" TEXT,
      "approvedAt" TIMESTAMP(3),
      "approvedById" INTEGER,
      "approvedByName" TEXT,
      "warehouseNote" TEXT,
      "rejectReason" TEXT,
      "terminationRequestedAt" TIMESTAMP(3),
      "terminationRequestedBy" TEXT,
      "terminationReason" TEXT,
      "terminationEffectiveAt" TIMESTAMP(3),
      "terminatedAt" TIMESTAMP(3),
      "createdById" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "WarehouseContract_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "WarehouseContract_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "PartnerWarehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "WarehouseContract_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "WarehouseContract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "WarehouseContract_contractNo_key" ON "WarehouseContract"("contractNo")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WarehouseContract_cargoId_status_idx" ON "WarehouseContract"("cargoId", "status")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WarehouseContract_warehouseId_status_idx" ON "WarehouseContract"("warehouseId", "status")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WarehouseContract_status_updatedAt_idx" ON "WarehouseContract"("status", "updatedAt")`)
  // Нэг карго × нэг агуулах хооронд зэрэг зөвхөн нэг амьд гэрээ — Prisma схемд илэрхийлэгдэхгүй тул DB-д
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "WarehouseContract_one_open_per_pair"
    ON "WarehouseContract"("cargoId", "warehouseId")
    WHERE "status" NOT IN ('TERMINATED', 'REJECTED')
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ContractEvent" (
      "id" SERIAL NOT NULL,
      "contractId" INTEGER NOT NULL,
      "actorId" INTEGER,
      "actorName" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "detail" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ContractEvent_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ContractEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "WarehouseContract"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ContractEvent_contractId_createdAt_idx" ON "ContractEvent"("contractId", "createdAt")`)

  console.log('OK: ContractTemplate + WarehouseContract + ContractEvent ready')
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('Алдаа:', e); process.exit(1) })

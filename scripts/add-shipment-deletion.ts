// npx tsx --env-file=.env.local scripts/add-shipment-deletion.ts
// Устгасан ачааны түүх — дараа нь трак кодоор хайхад "хэзээ, хэн, яаж устгасан" гэдгийг харуулна (raw DDL)
import { prisma } from '../lib/prisma'

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ShipmentDeletion" (
      "id" SERIAL NOT NULL,
      "cargoId" INTEGER NOT NULL,
      "trackCode" TEXT NOT NULL,
      "phone" TEXT,
      "customerName" TEXT,
      "description" TEXT,
      "status" "Status" NOT NULL,
      "ereenArrivedAt" TIMESTAMP(3),
      "shipmentCreatedAt" TIMESTAMP(3),
      "source" TEXT NOT NULL,
      "note" TEXT,
      "deletedById" INTEGER NOT NULL,
      "deletedByName" TEXT NOT NULL,
      "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ShipmentDeletion_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ShipmentDeletion_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ShipmentDeletion_cargoId_trackCode_idx" ON "ShipmentDeletion"("cargoId", "trackCode")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ShipmentDeletion_cargoId_phone_idx" ON "ShipmentDeletion"("cargoId", "phone")`)
  console.log('OK: ShipmentDeletion table ready')
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('Алдаа:', e); process.exit(1) })

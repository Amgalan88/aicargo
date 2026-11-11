// Урамшууллын (Карго оноо · VIP) хүснэгтүүд — зөвхөн НЭМЭХ өөрчлөлт, давтан ажиллуулж болно (IF NOT EXISTS).
// prisma/schema.prisma-тай яг таарна (`prisma migrate diff` хоосон байх ёстой — lib/loyalty.db.test.ts шалгана).
// Одоо байгаа мөрүүдийг өөрчлөхгүй: Shipment-д nullable "receiptId" л нэмнэ. Анхдагчаар бүх карго урамшуулалгүй.
// Shipment дээрх индексийг CONCURRENTLY үүсгэнэ — тиймээс энэ жагсаалтыг транзакцид бүү боо.

const fk = (table: string, name: string, def: string) => `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
    ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ${def};
  END IF;
END $$`

const check = (table: string, name: string, expr: string) => fk(table, name, `CHECK (${expr})`)

export const LOYALTY_DDL: string[] = [
  `ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "receiptId" INTEGER`,

  `CREATE TABLE IF NOT EXISTS "LoyaltySettings" (
    "cargoId" INTEGER NOT NULL,
    "pointsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "vipEnabled" BOOLEAN NOT NULL DEFAULT false,
    "earnMntPerPoint" INTEGER NOT NULL DEFAULT 1000,
    "pointValueMnt" INTEGER NOT NULL DEFAULT 20,
    "pointsExpiryDays" INTEGER NOT NULL DEFAULT 180,
    "maxRedeemPct" INTEGER NOT NULL DEFAULT 50,
    "vipWindowDays" INTEGER NOT NULL DEFAULT 90,
    "vipGraceDays" INTEGER NOT NULL DEFAULT 30,
    "vipTiers" JSONB NOT NULL,
    "updatedById" INTEGER,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltySettings_pkey" PRIMARY KEY ("cargoId")
  )`,

  `CREATE TABLE IF NOT EXISTS "LoyaltyAccount" (
    "id" SERIAL NOT NULL,
    "cargoId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "vipManualPct" INTEGER,
    "vipManualNote" TEXT,
    "vipManualUntil" TIMESTAMP(3),
    "vipManualById" INTEGER,
    "vipManualByName" TEXT,
    "vipManualAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "HandoverReceipt" (
    "id" SERIAL NOT NULL,
    "cargoId" INTEGER NOT NULL,
    "requestKey" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "phone" TEXT,
    "userId" INTEGER,
    "itemCount" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "grossMnt" DECIMAL(12,2) NOT NULL,
    "vipEnabled" BOOLEAN NOT NULL DEFAULT false,
    "vipPct" INTEGER NOT NULL DEFAULT 0,
    "vipSource" TEXT,
    "vipDiscountMnt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pointsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "pointsRedeemedMnt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "earnMntPerPoint" INTEGER,
    "pointValueMnt" INTEGER,
    "netMnt" DECIMAL(12,2) NOT NULL,
    "loyaltyNote" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HandoverReceipt_pkey" PRIMARY KEY ("id")
  )`,
  // Олголтыг «Ирсэн» төлөвт буцаахад баримт цуцлагдана (мөр устахгүй)
  `ALTER TABLE "HandoverReceipt" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3)`,
  `ALTER TABLE "HandoverReceipt" ADD COLUMN IF NOT EXISTS "voidedById" INTEGER`,
  `ALTER TABLE "HandoverReceipt" ADD COLUMN IF NOT EXISTS "voidedByName" TEXT`,

  `CREATE TABLE IF NOT EXISTS "LoyaltyLedger" (
    "id" SERIAL NOT NULL,
    "cargoId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "receiptId" INTEGER,
    "priceChangeId" INTEGER,
    "refLedgerId" INTEGER,
    "dedupeKey" TEXT NOT NULL,
    "note" TEXT,
    "actorId" INTEGER,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyLedger_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "ShipmentPriceChange" (
    "id" SERIAL NOT NULL,
    "cargoId" INTEGER NOT NULL,
    "shipmentId" INTEGER NOT NULL,
    "trackCode" TEXT NOT NULL,
    "status" "Status" NOT NULL,
    "oldPrice" DECIMAL(10,2),
    "newPrice" DECIMAL(10,2),
    "receiptId" INTEGER,
    "vipDiscountDeltaMnt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pointsDelta" INTEGER NOT NULL DEFAULT 0,
    "actorId" INTEGER NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipmentPriceChange_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE INDEX IF NOT EXISTS "LoyaltyAccount_cargoId_vipManualPct_idx" ON "LoyaltyAccount"("cargoId", "vipManualPct")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyAccount_cargoId_phone_key" ON "LoyaltyAccount"("cargoId", "phone")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyLedger_dedupeKey_key" ON "LoyaltyLedger"("dedupeKey")`,
  `CREATE INDEX IF NOT EXISTS "LoyaltyLedger_cargoId_accountId_createdAt_idx" ON "LoyaltyLedger"("cargoId", "accountId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "LoyaltyLedger_cargoId_createdAt_idx" ON "LoyaltyLedger"("cargoId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "LoyaltyLedger_receiptId_idx" ON "LoyaltyLedger"("receiptId")`,
  `CREATE INDEX IF NOT EXISTS "HandoverReceipt_cargoId_createdAt_idx" ON "HandoverReceipt"("cargoId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "HandoverReceipt_cargoId_phone_createdAt_idx" ON "HandoverReceipt"("cargoId", "phone", "createdAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "HandoverReceipt_cargoId_requestKey_ownerKey_key" ON "HandoverReceipt"("cargoId", "requestKey", "ownerKey")`,
  `CREATE INDEX IF NOT EXISTS "ShipmentPriceChange_cargoId_createdAt_idx" ON "ShipmentPriceChange"("cargoId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ShipmentPriceChange_receiptId_idx" ON "ShipmentPriceChange"("receiptId")`,
  `CREATE INDEX IF NOT EXISTS "ShipmentPriceChange_cargoId_shipmentId_idx" ON "ShipmentPriceChange"("cargoId", "shipmentId")`,
  // ~100k мөртэй хүснэгт — бичилтийг түгжихгүйн тулд CONCURRENTLY
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Shipment_receiptId_idx" ON "Shipment"("receiptId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Shipment_cargoId_phone_status_idx" ON "Shipment"("cargoId", "phone", "status")`,

  // Бүх "receiptId" null тул шалгалт агшин зуур
  fk('Shipment', 'Shipment_receiptId_fkey', `FOREIGN KEY ("receiptId") REFERENCES "HandoverReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE`),
  fk('LoyaltySettings', 'LoyaltySettings_cargoId_fkey', `FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE`),
  fk('LoyaltyAccount', 'LoyaltyAccount_cargoId_fkey', `FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE`),
  fk('LoyaltyLedger', 'LoyaltyLedger_cargoId_fkey', `FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE`),
  fk('LoyaltyLedger', 'LoyaltyLedger_accountId_fkey', `FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE`),
  fk('LoyaltyLedger', 'LoyaltyLedger_receiptId_fkey', `FOREIGN KEY ("receiptId") REFERENCES "HandoverReceipt"("id") ON DELETE NO ACTION ON UPDATE CASCADE`),
  fk('HandoverReceipt', 'HandoverReceipt_cargoId_fkey', `FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE`),
  fk('HandoverReceipt', 'HandoverReceipt_userId_fkey', `FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`),
  fk('ShipmentPriceChange', 'ShipmentPriceChange_cargoId_fkey', `FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE`),

  // Утгын хамгаалалт (Prisma-д харагдахгүй, зөвхөн DB түвшинд)
  check('LoyaltySettings', 'LoyaltySettings_values_check',
    `"earnMntPerPoint" > 0 AND "pointValueMnt" > 0 AND "pointsExpiryDays" BETWEEN 1 AND 3650
     AND "maxRedeemPct" BETWEEN 0 AND 100 AND "vipWindowDays" BETWEEN 1 AND 365 AND "vipGraceDays" BETWEEN 0 AND 365
     AND jsonb_typeof("vipTiers") = 'array'`),
  check('LoyaltyAccount', 'LoyaltyAccount_vipManualPct_check', `"vipManualPct" IS NULL OR "vipManualPct" BETWEEN 1 AND 5`),
  // v2: VOID (олголт буцаасан) нэмэгдсэн. Хуучин (v1) шалгалттай DB-д v1-ийг хасаад v2-ийг нэмнэ — давтан ажиллуулж болно
  `ALTER TABLE "LoyaltyLedger" DROP CONSTRAINT IF EXISTS "LoyaltyLedger_kind_check"`,
  check('LoyaltyLedger', 'LoyaltyLedger_kind_v2_check',
    `("kind" = 'EARN' AND "points" > 0) OR ("kind" = 'REDEEM' AND "points" < 0)
     OR ("kind" = 'EXPIRE' AND "points" < 0) OR ("kind" = 'ADJUST' AND "points" <> 0)
     OR ("kind" = 'VOID' AND "points" <> 0)`),
  check('HandoverReceipt', 'HandoverReceipt_void_check', `"voidedAt" IS NULL OR "voidedById" IS NOT NULL`),
  check('HandoverReceipt', 'HandoverReceipt_amounts_check',
    `"vipPct" BETWEEN 0 AND 5 AND "grossMnt" >= 0 AND "vipDiscountMnt" >= 0 AND "pointsRedeemed" >= 0
     AND "pointsRedeemedMnt" >= 0 AND "pointsEarned" >= 0 AND "netMnt" >= 0 AND "itemCount" > 0`),

  // Дэвтэр зөвхөн нэмэгдэнэ: UPDATE хэзээ ч болохгүй. DELETE зөвхөн карго бүхэлдээ устахад (cascade)
  // эсвэл демо цэвэрлэгээ `SET LOCAL aicargo.loyalty_purge = 'on'` үед
  `CREATE OR REPLACE FUNCTION "loyalty_ledger_append_only"() RETURNS trigger AS $$
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'LoyaltyLedger is append-only (UPDATE forbidden)';
    END IF;
    IF current_setting('aicargo.loyalty_purge', true) = 'on'
       OR NOT EXISTS (SELECT 1 FROM "Cargo" WHERE id = OLD."cargoId") THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'LoyaltyLedger is append-only (DELETE forbidden)';
  END $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS "LoyaltyLedger_append_only" ON "LoyaltyLedger"`,
  `CREATE TRIGGER "LoyaltyLedger_append_only" BEFORE UPDATE OR DELETE ON "LoyaltyLedger"
    FOR EACH ROW EXECUTE FUNCTION "loyalty_ledger_append_only"()`,

  // Supabase Data API (anon/authenticated)-аас хаана. Апп нь хүснэгтийн эзэн ролиор (Prisma) холбогддог тул нөлөөлөхгүй
  `ALTER TABLE "LoyaltySettings" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "LoyaltyAccount" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "LoyaltyLedger" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "HandoverReceipt" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "ShipmentPriceChange" ENABLE ROW LEVEL SECURITY`,
]

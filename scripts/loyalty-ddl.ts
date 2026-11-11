// Урамшууллын систем + олголтын баримтын DDL. Зөвхөн нэмэлт (шинэ хүснэгт, nullable багана) — одоо байгаа
// өгөгдөлд хүрэхгүй. Дахин ажиллуулахад аюулгүй (IF NOT EXISTS). prisma/schema.prisma-тай яг таарна:
// `prisma migrate diff --from-schema <хуучин> --to-schema prisma/schema.prisma --script`-ийн гаралттай ижил нэр, төрөл.
// scripts/add-loyalty.ts ажиллуулна; lib/loyalty-db.test.ts локал DB дээр яг энэ жагсаалтыг хэрэглэнэ.

const NEW_TABLES = [
  'LoyaltySettings', 'LoyaltyAccount', 'LoyaltyLedger', 'HandoverReceipt', 'HandoverReceiptAdjustment', 'ShipmentPriceLog',
] as const

export const LOYALTY_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "LoyaltySettings" (
    "cargoId" INTEGER NOT NULL,
    "vipEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pointsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "vipTiers" JSONB NOT NULL,
    "mntPerPoint" INTEGER NOT NULL DEFAULT 1000,
    "pointValueMnt" INTEGER NOT NULL DEFAULT 20,
    "updatedById" INTEGER,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltySettings_pkey" PRIMARY KEY ("cargoId"),
    CONSTRAINT "LoyaltySettings_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS "LoyaltyAccount" (
    "id" SERIAL NOT NULL,
    "cargoId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "userId" INTEGER,
    "manualVipPct" INTEGER,
    "manualVipNote" TEXT,
    "manualVipUntil" TIMESTAMP(3),
    "manualVipById" INTEGER,
    "manualVipByName" TEXT,
    "manualVipAt" TIMESTAMP(3),
    "autoVipPct" INTEGER NOT NULL DEFAULT 0,
    "autoVipSpend" INTEGER NOT NULL DEFAULT 0,
    "autoVipGraceUntil" TIMESTAMP(3),
    "autoVipCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LoyaltyAccount_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyAccount_cargoId_phone_key" ON "LoyaltyAccount"("cargoId", "phone")`,
  `CREATE INDEX IF NOT EXISTS "LoyaltyAccount_cargoId_autoVipPct_idx" ON "LoyaltyAccount"("cargoId", "autoVipPct")`,
  `CREATE INDEX IF NOT EXISTS "LoyaltyAccount_cargoId_manualVipPct_idx" ON "LoyaltyAccount"("cargoId", "manualVipPct")`,

  `CREATE TABLE IF NOT EXISTS "LoyaltyLedger" (
    "id" SERIAL NOT NULL,
    "cargoId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "receiptId" INTEGER,
    "adjustmentId" INTEGER,
    "refLedgerId" INTEGER,
    "dedupeKey" TEXT NOT NULL,
    "note" TEXT,
    "actorId" INTEGER,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyLedger_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LoyaltyLedger_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoyaltyLedger_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyLedger_cargoId_dedupeKey_key" ON "LoyaltyLedger"("cargoId", "dedupeKey")`,
  `CREATE INDEX IF NOT EXISTS "LoyaltyLedger_accountId_createdAt_idx" ON "LoyaltyLedger"("accountId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "LoyaltyLedger_cargoId_createdAt_idx" ON "LoyaltyLedger"("cargoId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "LoyaltyLedger_expiresAt_idx" ON "LoyaltyLedger"("expiresAt")`,
  // Append-only: UPDATE хэзээ ч болохгүй. DELETE зөвхөн карго устгах cascade (эцэг мөр алга болсон)
  // эсвэл демо каргог цэвэрлэх (SET LOCAL aicargo.loyalty_purge = 'on') үед
  `CREATE OR REPLACE FUNCTION "loyalty_ledger_append_only"() RETURNS trigger AS $$
  BEGIN
    IF TG_OP = 'DELETE' AND (
      NOT EXISTS (SELECT 1 FROM "Cargo" WHERE "id" = OLD."cargoId")
      OR current_setting('aicargo.loyalty_purge', true) = 'on'
    ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'LoyaltyLedger is append-only: % is not allowed', TG_OP;
  END;
  $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS "LoyaltyLedger_append_only" ON "LoyaltyLedger"`,
  `CREATE TRIGGER "LoyaltyLedger_append_only" BEFORE UPDATE OR DELETE ON "LoyaltyLedger"
    FOR EACH ROW EXECUTE FUNCTION "loyalty_ledger_append_only"()`,

  `CREATE TABLE IF NOT EXISTS "HandoverReceipt" (
    "id" SERIAL NOT NULL,
    "cargoId" INTEGER NOT NULL,
    "requestKey" TEXT,
    "idemKey" TEXT,
    "phone" TEXT,
    "userId" INTEGER,
    "accountId" INTEGER,
    "lines" JSONB NOT NULL,
    "shipmentCount" INTEGER NOT NULL,
    "grossMnt" INTEGER NOT NULL,
    "vipPct" INTEGER NOT NULL DEFAULT 0,
    "vipSource" TEXT,
    "discountMnt" INTEGER NOT NULL DEFAULT 0,
    "redeemedPoints" INTEGER NOT NULL DEFAULT 0,
    "redeemedMnt" INTEGER NOT NULL DEFAULT 0,
    "netMnt" INTEGER NOT NULL,
    "earnedPoints" INTEGER NOT NULL DEFAULT 0,
    "mntPerPoint" INTEGER,
    "pointValueMnt" INTEGER,
    "skipReason" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HandoverReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HandoverReceipt_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HandoverReceipt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "HandoverReceipt_cargoId_idemKey_key" ON "HandoverReceipt"("cargoId", "idemKey")`,
  `CREATE INDEX IF NOT EXISTS "HandoverReceipt_cargoId_createdAt_idx" ON "HandoverReceipt"("cargoId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "HandoverReceipt_cargoId_phone_createdAt_idx" ON "HandoverReceipt"("cargoId", "phone", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "HandoverReceipt_cargoId_requestKey_idx" ON "HandoverReceipt"("cargoId", "requestKey")`,

  `CREATE TABLE IF NOT EXISTS "HandoverReceiptAdjustment" (
    "id" SERIAL NOT NULL,
    "cargoId" INTEGER NOT NULL,
    "receiptId" INTEGER NOT NULL,
    "shipmentId" INTEGER,
    "reason" TEXT NOT NULL,
    "grossDelta" INTEGER NOT NULL,
    "discountDelta" INTEGER NOT NULL,
    "redeemedPointsDelta" INTEGER NOT NULL,
    "redeemedMntDelta" INTEGER NOT NULL,
    "netDelta" INTEGER NOT NULL,
    "earnedPointsDelta" INTEGER NOT NULL,
    "note" TEXT,
    "actorId" INTEGER NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HandoverReceiptAdjustment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HandoverReceiptAdjustment_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HandoverReceiptAdjustment_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "HandoverReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "HandoverReceiptAdjustment_cargoId_createdAt_idx" ON "HandoverReceiptAdjustment"("cargoId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "HandoverReceiptAdjustment_receiptId_idx" ON "HandoverReceiptAdjustment"("receiptId")`,

  `CREATE TABLE IF NOT EXISTS "ShipmentPriceLog" (
    "id" SERIAL NOT NULL,
    "cargoId" INTEGER NOT NULL,
    "shipmentId" INTEGER NOT NULL,
    "trackCode" TEXT NOT NULL,
    "oldPrice" DECIMAL(10,2),
    "newPrice" DECIMAL(10,2),
    "status" "Status" NOT NULL,
    "receiptId" INTEGER,
    "source" TEXT NOT NULL,
    "actorId" INTEGER NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipmentPriceLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShipmentPriceLog_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "ShipmentPriceLog_cargoId_createdAt_idx" ON "ShipmentPriceLog"("cargoId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ShipmentPriceLog_cargoId_shipmentId_idx" ON "ShipmentPriceLog"("cargoId", "shipmentId")`,

  // Shipment (~100k мөр): nullable багана нэмэх нь зөвхөн metadata. Индексийг CONCURRENTLY — бичилтийг түгжихгүй.
  // FK-г NOT VALID-аар нэмээд дараа нь VALIDATE — хүснэгтийг удаан түгжихгүй (бүх мөр null тул шууд давна)
  `ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "receiptId" INTEGER`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Shipment_receiptId_idx" ON "Shipment"("receiptId")`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Shipment_receiptId_fkey') THEN
      ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_receiptId_fkey" FOREIGN KEY ("receiptId")
        REFERENCES "HandoverReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
    END IF;
  END $$`,
  `ALTER TABLE "Shipment" VALIDATE CONSTRAINT "Shipment_receiptId_fkey"`,
]

// Supabase-ийн PostgREST (anon/authenticated) эдгээр хүснэгтийг унших, бичих боломжгүй. Апп Prisma-аар хүснэгтийн
// эзэмшигч role-оор холбогддог тул RLS-ээс үл хамаарна (LOYALTY_RLS_CHECK-ээр эхлээд шалгана).
// Локал Postgres-д anon/authenticated role байхгүй — алгасна
export const LOYALTY_RLS_DDL: string[] = [
  ...NEW_TABLES.map(t => `ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`),
  `DO $$
  DECLARE r TEXT; t TEXT;
  BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        FOREACH t IN ARRAY ARRAY[${NEW_TABLES.map(t => `'${t}'`).join(', ')}] LOOP
          EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', t, r);
        END LOOP;
      END IF;
    END LOOP;
  END $$`,
]

// Апп-ын role шинэ хүснэгтийн эзэмшигч эсвэл BYPASSRLS биш бол RLS нь Prisma-гийн уншилтыг хаана — урьдчилан шалгана
export const LOYALTY_RLS_CHECK = `
  SELECT c.relname AS "table", c.relrowsecurity AS "rls",
    (pg_get_userbyid(c.relowner) = current_user OR r.rolbypassrls OR r.rolsuper) AS "appBypasses"
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, pg_roles r
  WHERE n.nspname = current_schema() AND r.rolname = current_user
    AND c.relname IN (${NEW_TABLES.map(t => `'${t}'`).join(', ')})
  ORDER BY 1`

export const SHIPMENT_INDEX_VALID_CHECK = `
  SELECT i.indisvalid AS "valid" FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
  WHERE c.relname = 'Shipment_receiptId_idx'`

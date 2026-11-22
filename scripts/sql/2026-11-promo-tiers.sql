-- Промо код + шатлалтай хөнгөлөлт (Атлас каргын хүсэлт, 2026-11-23). Push хийхээс ӨМНӨ ажиллуулна.
-- Шинэ багана/хүснэгт хоосон, promoEnabled анхдагч false тул бусад каргод нөлөөгүй.
-- Хувийн дээд хязгаарын DB шалгалтыг 5 → 50 болгоно; код нь промо горимгүй каргод 5%-иар хязгаарласаар байна.
BEGIN;

ALTER TABLE "Cargo" ADD COLUMN IF NOT EXISTS "promoEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Cargo" ADD COLUMN IF NOT EXISTS "discountTiers" JSONB;
ALTER TABLE "LoyaltyAccount" ADD COLUMN IF NOT EXISTS "vipManualTier" TEXT;

ALTER TABLE "LoyaltyAccount" DROP CONSTRAINT IF EXISTS "LoyaltyAccount_vipManualPct_check";
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_vipManualPct_check"
  CHECK ("vipManualPct" IS NULL OR "vipManualPct" BETWEEN 1 AND 50);
ALTER TABLE "HandoverReceipt" DROP CONSTRAINT IF EXISTS "HandoverReceipt_amounts_check";
ALTER TABLE "HandoverReceipt" ADD CONSTRAINT "HandoverReceipt_amounts_check"
  CHECK ("vipPct" BETWEEN 0 AND 50 AND "grossMnt" >= 0 AND "vipDiscountMnt" >= 0 AND "pointsRedeemed" >= 0
     AND "pointsRedeemedMnt" >= 0 AND "pointsEarned" >= 0 AND "netMnt" >= 0 AND "itemCount" > 0);

CREATE TABLE IF NOT EXISTS "PromoCode" (
  "id" SERIAL PRIMARY KEY,
  "cargoId" INTEGER NOT NULL REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "code" TEXT NOT NULL,
  "agentName" TEXT NOT NULL,
  "agentPhone" TEXT,
  "commissionPct" DECIMAL(5, 2) NOT NULL CHECK ("commissionPct" >= 0 AND "commissionPct" <= 100),
  "tierName" TEXT,
  "tierPct" INTEGER CHECK ("tierPct" IS NULL OR "tierPct" BETWEEN 1 AND 50),
  "token" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" INTEGER,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PromoCode_token_key" ON "PromoCode"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "PromoCode_cargoId_code_key" ON "PromoCode"("cargoId", "code");

CREATE TABLE IF NOT EXISTS "PromoMember" (
  "id" SERIAL PRIMARY KEY,
  "cargoId" INTEGER NOT NULL REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "phone" TEXT NOT NULL,
  "promoCodeId" INTEGER NOT NULL REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "source" TEXT NOT NULL CHECK ("source" IN ('signup', 'admin')),
  "byName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PromoMember_cargoId_phone_key" ON "PromoMember"("cargoId", "phone");
CREATE INDEX IF NOT EXISTS "PromoMember_promoCodeId_idx" ON "PromoMember"("promoCodeId");

-- Бусад хүснэгтийн адил: зөвхөн сервер (Prisma) хандана
ALTER TABLE "PromoCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromoMember" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PromoCode", "PromoMember" FROM anon, authenticated;
REVOKE ALL ON SEQUENCE "PromoCode_id_seq", "PromoMember_id_seq" FROM anon, authenticated;

-- Туршилт: зөвхөн Атлас
UPDATE "Cargo" SET "promoEnabled" = true WHERE id = 90 AND slug = 'atlas';

COMMIT;

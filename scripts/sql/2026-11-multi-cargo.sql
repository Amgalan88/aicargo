-- Нэг эзэмшигч — олон карго (2026-11-25). Эзэмшигч админ өөрөө «Шинэ карго нээх».
-- Зөвхөн ШИНЭ хүснэгт нэмнэ — одоо байгаа хүснэгт, өгөгдөлд хүрэхгүй.
-- Буцаах: scripts/sql/2026-11-multi-cargo-rollback.sql
CREATE TABLE IF NOT EXISTS "CargoOwner" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "cargoId" INTEGER NOT NULL REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CargoOwner_userId_cargoId_key" ON "CargoOwner"("userId", "cargoId");
CREATE INDEX IF NOT EXISTS "CargoOwner_cargoId_idx" ON "CargoOwner"("cargoId");

-- Бусад хүснэгтийн адил: зөвхөн сервер (Prisma) хандана
ALTER TABLE "CargoOwner" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CargoOwner" FROM anon, authenticated;
REVOKE ALL ON SEQUENCE "CargoOwner_id_seq" FROM anon, authenticated;

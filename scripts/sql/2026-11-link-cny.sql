-- Линк захиалга: админ үнийг юанаар оруулж, ханшаар ₮ болгоно (Эрхэм каргын хүсэлт, 2026-11-22).
-- Push хийхээс ӨМНӨ ажиллуулна — шинэ багануудгүй бол Prisma Cargo / LinkOrder уншихдаа алдаа өгнө.
-- Бүгд NULL-тэй тул одоогийн өгөгдөл, бусад каргод нөлөөгүй.
ALTER TABLE "Cargo" ADD COLUMN IF NOT EXISTS "linkCnyRate" DECIMAL(10, 2);
ALTER TABLE "LinkOrder" ADD COLUMN IF NOT EXISTS "priceCny" DECIMAL(12, 2);
ALTER TABLE "LinkOrder" ADD COLUMN IF NOT EXISTS "cnyRate" DECIMAL(10, 2);

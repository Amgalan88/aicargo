-- Админы туслах (буланд зогсдог дүр): каргоны асаах/унтраах тохиргоо (2026-11-24).
-- Push хийхээс ӨМНӨ ажиллуулна — шинэ баганагүй бол Prisma Cargo уншихдаа алдаа өгнө.
-- AI асаалттай байсан каргод анхнаасаа асаалттай, бусад нь эзэмшигч тохиргооноос асаана.
ALTER TABLE "Cargo" ADD COLUMN IF NOT EXISTS "assistantEnabled" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Cargo" SET "assistantEnabled" = true WHERE "aiEnabled" = true;

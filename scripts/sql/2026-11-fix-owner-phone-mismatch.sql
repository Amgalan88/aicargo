-- 1 трак = 1 утас/эзэн: Shipment.phone нь эзэн хэрэглэгчийн утаснаас ӨӨР (олгоогүй) ачааг засна.
-- Shipment.phone (админ/Excel-ийн сүүлд бичсэн утас) давуу: тэр утастай хэрэглэгч энэ каргод байвал түүнд,
-- үгүй бол userId = NULL (хуучин хүний жагсаалтаас гарна).
-- 2026-11-02 байдлаар: 28 мөр (27 ARRIVED, 1 EREEN_ARRIVED); 6 нь өөр бүртгэлтэй хэрэглэгчийн утас.
-- ЭХЛЭЭД SELECT-ээр шалгаад, Amgalan зөвшөөрсний дараа л ажиллуулна. Хэрэглэгч утсаа өөрөө сольсон
-- (phoneVerifiedAt > updatedAt) мөрийг хасна — тэр тохиолдолд хэрэглэгч зөв, phone талбар хуучин.
BEGIN;
WITH bad AS (
  SELECT s.id, s."cargoId", s.phone
  FROM "Shipment" s JOIN "User" u ON u.id = s."userId"
  WHERE s.phone IS NOT NULL AND s.phone <> u.phone AND s.status <> 'PICKED_UP'
    AND NOT (u."phoneVerifiedAt" IS NOT NULL AND u."phoneVerifiedAt" > s."updatedAt")
)
UPDATE "Shipment" s
SET "userId" = (SELECT o.id FROM "User" o WHERE o.phone = bad.phone AND o."cargoId" = bad."cargoId"),
    "updatedAt" = s."updatedAt"
FROM bad WHERE s.id = bad.id
RETURNING s.id, s."cargoId", s.status;
-- Тоо зөв бол COMMIT, үгүй бол ROLLBACK
ROLLBACK;

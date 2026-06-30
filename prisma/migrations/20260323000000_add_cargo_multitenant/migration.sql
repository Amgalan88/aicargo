-- CreateTable Cargo
CREATE TABLE "Cargo" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ereemReceiver" TEXT NOT NULL,
    "ereemPhone" TEXT NOT NULL,
    "ereemAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cargo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Cargo_slug_key" ON "Cargo"("slug");

-- Seed: Darkhan cargo (id = 1)
INSERT INTO "Cargo" ("name", "slug", "ereemReceiver", "ereemPhone", "ereemAddress")
VALUES ('Дарханы бусийн карго', 'darkhan', 'darkhan+ өөрийн утас', '18647933620', '环宇商贸城9栋24号нэр+утас+darkhan');

-- Add cargoId to User (default 1 = Darkhan, then drop default)
ALTER TABLE "User" ADD COLUMN "cargoId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ALTER COLUMN "cargoId" DROP DEFAULT;
ALTER TABLE "User" ADD CONSTRAINT "User_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add cargoId to Shipment, replace unique constraint
ALTER TABLE "Shipment" ADD COLUMN "cargoId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Shipment" ALTER COLUMN "cargoId" DROP DEFAULT;
DROP INDEX IF EXISTS "Shipment_trackCode_key";
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_trackCode_cargoId_key" UNIQUE ("trackCode", "cargoId");
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add cargoId to Faq
ALTER TABLE "Faq" ADD COLUMN "cargoId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Faq" ALTER COLUMN "cargoId" DROP DEFAULT;
ALTER TABLE "Faq" ADD CONSTRAINT "Faq_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add SUPER_ADMIN to Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

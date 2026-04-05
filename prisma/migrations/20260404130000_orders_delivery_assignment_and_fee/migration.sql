-- Add out_for_delivery to OrderStatus
DO $$ BEGIN
  ALTER TYPE "OrderStatus" ADD VALUE 'out_for_delivery';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryManId" INTEGER;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Order"
    ADD CONSTRAINT "Order_deliveryManId_fkey"
    FOREIGN KEY ("deliveryManId") REFERENCES "deliveryMen"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Backfill: align existing totals to include deliveryFee (default 0)
UPDATE "Order" SET "deliveryFee" = COALESCE("deliveryFee", 0) WHERE "deliveryFee" IS NULL;


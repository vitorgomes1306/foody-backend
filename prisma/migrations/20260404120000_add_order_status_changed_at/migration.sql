-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Order"
SET "statusChangedAt" = "createdAt";


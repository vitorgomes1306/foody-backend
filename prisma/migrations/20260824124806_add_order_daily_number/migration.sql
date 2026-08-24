-- AlterTable
ALTER TABLE "BillingSettings" ALTER COLUMN "activeProvider" SET DEFAULT 'sicoob';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "dailyNumber" INTEGER;

-- CreateTable
CREATE TABLE "OrderDailyCounter" (
    "tenantId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderDailyCounter_pkey" PRIMARY KEY ("tenantId","date")
);

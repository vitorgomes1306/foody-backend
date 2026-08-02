-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentMethodType" "PaymentMethodType";
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);


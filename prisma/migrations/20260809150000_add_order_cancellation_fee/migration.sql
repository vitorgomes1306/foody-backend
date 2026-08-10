ALTER TABLE "Order"
ADD COLUMN "cancellationFee" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "Order"
ADD COLUMN "cancellationPaymentMethodType" "PaymentMethodType",
ADD COLUMN "cancellationFeePaidAt" TIMESTAMP(3);

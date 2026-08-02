ALTER TABLE "Product"
ADD COLUMN "allowFraction" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "skipKds" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "OrderItem"
ADD COLUMN "fractionProductId" INTEGER;

ALTER TABLE "OrderItem"
ADD CONSTRAINT "OrderItem_fractionProductId_fkey"
FOREIGN KEY ("fractionProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OrderItem_fractionProductId_idx" ON "OrderItem"("fractionProductId");

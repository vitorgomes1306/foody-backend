CREATE TABLE "OrderExtra" (
  "id" SERIAL NOT NULL,
  "orderId" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderExtra_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderExtra_orderId_idx" ON "OrderExtra"("orderId");

ALTER TABLE "OrderExtra"
ADD CONSTRAINT "OrderExtra_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

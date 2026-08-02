ALTER TABLE "Order" ADD COLUMN "customerSessionId" TEXT;
CREATE INDEX "Order_tenantId_customerSessionId_createdAt_idx" ON "Order"("tenantId", "customerSessionId", "createdAt");

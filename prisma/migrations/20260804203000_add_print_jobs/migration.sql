CREATE TABLE "PrintJob" (
  "id" SERIAL NOT NULL,
  "tenantId" UUID NOT NULL,
  "orderId" INTEGER NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'customer_bill',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "requestedBy" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "printedAt" TIMESTAMP(3),
  CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PrintJob_tenantId_status_createdAt_idx" ON "PrintJob"("tenantId", "status", "createdAt");
CREATE INDEX "PrintJob_orderId_idx" ON "PrintJob"("orderId");
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

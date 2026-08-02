CREATE TABLE "Waiter" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Waiter_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order" ADD COLUMN "waiterId" INTEGER;
CREATE INDEX "Waiter_tenantId_idx" ON "Waiter"("tenantId");
ALTER TABLE "Waiter" ADD CONSTRAINT "Waiter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

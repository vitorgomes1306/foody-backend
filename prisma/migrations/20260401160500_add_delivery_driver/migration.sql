CREATE TABLE "DeliveryDriver" (
  "id" SERIAL NOT NULL,
  "tenantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeliveryDriver_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryDriver_tenantId_idx" ON "DeliveryDriver"("tenantId");

ALTER TABLE "DeliveryDriver"
ADD CONSTRAINT "DeliveryDriver_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

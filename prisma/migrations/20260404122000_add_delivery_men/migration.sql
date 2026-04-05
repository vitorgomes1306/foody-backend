-- CreateTable
CREATE TABLE "deliveryMen" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "plateVehicle" TEXT NOT NULL,
    "modelvehicle" TEXT NOT NULL,
    "tenantId" UUID NOT NULL,

    CONSTRAINT "deliveryMen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deliveryMen_tenantId_idx" ON "deliveryMen"("tenantId");

-- AddForeignKey
ALTER TABLE "deliveryMen" ADD CONSTRAINT "deliveryMen_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


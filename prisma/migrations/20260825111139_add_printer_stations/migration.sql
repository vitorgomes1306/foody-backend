-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "printerStationId" INTEGER;

-- CreateTable
CREATE TABLE "PrinterStation" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrinterStation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrinterStation_tenantId_key_key" ON "PrinterStation"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_printerStationId_fkey" FOREIGN KEY ("printerStationId") REFERENCES "PrinterStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrinterStation" ADD CONSTRAINT "PrinterStation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product"
ADD COLUMN "usesFlavors" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "maxFlavors" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "ProductFlavor" (
  "id" SERIAL NOT NULL,
  "productId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "price" DECIMAL(10,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductFlavor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderItemFlavor" (
  "id" SERIAL NOT NULL,
  "orderItemId" INTEGER NOT NULL,
  "flavorId" INTEGER NOT NULL,
  "nameApplied" TEXT NOT NULL,
  "priceApplied" DECIMAL(10,2) NOT NULL,
  "fraction" DECIMAL(5,4) NOT NULL,
  CONSTRAINT "OrderItemFlavor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductFlavor_productId_name_key" ON "ProductFlavor"("productId", "name");
CREATE INDEX "ProductFlavor_productId_idx" ON "ProductFlavor"("productId");
CREATE INDEX "OrderItemFlavor_orderItemId_idx" ON "OrderItemFlavor"("orderItemId");
CREATE INDEX "OrderItemFlavor_flavorId_idx" ON "OrderItemFlavor"("flavorId");
ALTER TABLE "ProductFlavor" ADD CONSTRAINT "ProductFlavor_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItemFlavor" ADD CONSTRAINT "OrderItemFlavor_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItemFlavor" ADD CONSTRAINT "OrderItemFlavor_flavorId_fkey" FOREIGN KEY ("flavorId") REFERENCES "ProductFlavor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

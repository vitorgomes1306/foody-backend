CREATE TABLE "ProductVariant" (
  "id" SERIAL NOT NULL,
  "productId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "price" DECIMAL(10,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "seq" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProductVariantFlavor" (
  "id" SERIAL NOT NULL,
  "variantId" INTEGER NOT NULL,
  "flavorId" INTEGER NOT NULL,
  "price" DECIMAL(10,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "ProductVariantFlavor_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "OrderItem" ADD COLUMN "variantId" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN "variantNameApplied" TEXT;
CREATE UNIQUE INDEX "ProductVariant_productId_name_key" ON "ProductVariant"("productId", "name");
CREATE INDEX "ProductVariant_productId_seq_idx" ON "ProductVariant"("productId", "seq");
CREATE UNIQUE INDEX "ProductVariantFlavor_variantId_flavorId_key" ON "ProductVariantFlavor"("variantId", "flavorId");
CREATE INDEX "ProductVariantFlavor_flavorId_idx" ON "ProductVariantFlavor"("flavorId");
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariantFlavor" ADD CONSTRAINT "ProductVariantFlavor_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariantFlavor" ADD CONSTRAINT "ProductVariantFlavor_flavorId_fkey" FOREIGN KEY ("flavorId") REFERENCES "ProductFlavor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

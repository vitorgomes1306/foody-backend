ALTER TABLE "Tenant" ADD COLUMN "fiscalEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "fiscalIssuerExternalId" TEXT;

ALTER TABLE "Product" ADD COLUMN "fiscalEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ncm" TEXT,
ADD COLUMN "cfop" INTEGER,
ADD COLUMN "fiscalUnit" TEXT DEFAULT 'UN',
ADD COLUMN "taxOrigin" INTEGER DEFAULT 0,
ADD COLUMN "icmsCsosn" INTEGER,
ADD COLUMN "pisCst" INTEGER,
ADD COLUMN "cofinsCst" INTEGER;

ALTER TABLE "Order" ADD COLUMN "fiscalDocumentId" TEXT,
ADD COLUMN "fiscalStatus" TEXT,
ADD COLUMN "fiscalError" TEXT,
ADD COLUMN "fiscalIssuedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Order_fiscalDocumentId_key" ON "Order"("fiscalDocumentId");

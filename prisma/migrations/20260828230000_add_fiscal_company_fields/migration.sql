ALTER TABLE "Tenant" ADD COLUMN "fiscalLegalName" TEXT,
ADD COLUMN "fiscalFederalTaxNumber" TEXT,
ADD COLUMN "fiscalStateTaxNumber" TEXT,
ADD COLUMN "fiscalTaxRegime" TEXT,
ADD COLUMN "fiscalCityCode" TEXT,
ADD COLUMN "fiscalCertificateExpiresAt" TIMESTAMP(3);

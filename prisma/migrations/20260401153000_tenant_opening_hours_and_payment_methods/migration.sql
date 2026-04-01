ALTER TABLE "Tenant"
ADD COLUMN "zipCode" TEXT,
ADD COLUMN "street" TEXT,
ADD COLUMN "number" TEXT,
ADD COLUMN "complement" TEXT,
ADD COLUMN "district" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "website" TEXT,
ADD COLUMN "instagram" TEXT,
ADD COLUMN "facebook" TEXT,
ADD COLUMN "twitter" TEXT,
ADD COLUMN "youtube" TEXT,
ADD COLUMN "geoLocation" TEXT;

CREATE TYPE "Weekday" AS ENUM ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');

CREATE TYPE "PaymentMethodType" AS ENUM ('cash', 'pix', 'debit_card', 'credit_card', 'voucher', 'other');

CREATE TABLE "TenantOpeningHour" (
  "id" SERIAL NOT NULL,
  "tenantId" UUID NOT NULL,
  "weekday" "Weekday" NOT NULL,
  "closed" BOOLEAN NOT NULL DEFAULT false,
  "openTime" TEXT,
  "closeTime" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TenantOpeningHour_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantPaymentMethod" (
  "id" SERIAL NOT NULL,
  "tenantId" UUID NOT NULL,
  "type" "PaymentMethodType" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "label" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TenantPaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantOpeningHour_tenantId_weekday_key" ON "TenantOpeningHour"("tenantId", "weekday");
CREATE INDEX "TenantOpeningHour_tenantId_idx" ON "TenantOpeningHour"("tenantId");

CREATE UNIQUE INDEX "TenantPaymentMethod_tenantId_type_key" ON "TenantPaymentMethod"("tenantId", "type");
CREATE INDEX "TenantPaymentMethod_tenantId_idx" ON "TenantPaymentMethod"("tenantId");

ALTER TABLE "TenantOpeningHour"
ADD CONSTRAINT "TenantOpeningHour_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantPaymentMethod"
ADD CONSTRAINT "TenantPaymentMethod_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

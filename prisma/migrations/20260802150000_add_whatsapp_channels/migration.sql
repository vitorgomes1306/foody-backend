CREATE TYPE "WhatsAppProvider" AS ENUM ('official', 'evolution');

CREATE TABLE "WhatsAppChannel" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "accessTokenEncrypted" TEXT,
    "appSecretEncrypted" TEXT,
    "evolutionInstanceName" TEXT,
    "evolutionInstanceId" TEXT,
    "connectedNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppChannel_tenantId_provider_key" ON "WhatsAppChannel"("tenantId", "provider");
CREATE INDEX "WhatsAppChannel_tenantId_idx" ON "WhatsAppChannel"("tenantId");
ALTER TABLE "WhatsAppChannel" ADD CONSTRAINT "WhatsAppChannel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WhatsAppWebhookEvent" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppWebhookEvent_tenantId_provider_createdAt_idx" ON "WhatsAppWebhookEvent"("tenantId", "provider", "createdAt");
CREATE INDEX "WhatsAppWebhookEvent_externalId_idx" ON "WhatsAppWebhookEvent"("externalId");
ALTER TABLE "WhatsAppWebhookEvent" ADD CONSTRAINT "WhatsAppWebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

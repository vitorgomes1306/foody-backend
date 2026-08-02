CREATE TABLE "WhatsAppConversationState" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL,
    "contactJid" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppConversationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppConversationState_tenantId_provider_contactJid_key" ON "WhatsAppConversationState"("tenantId", "provider", "contactJid");
CREATE INDEX "WhatsAppConversationState_tenantId_provider_archivedAt_idx" ON "WhatsAppConversationState"("tenantId", "provider", "archivedAt");
ALTER TABLE "WhatsAppConversationState" ADD CONSTRAINT "WhatsAppConversationState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppChannel" ADD COLUMN "selectedForMessaging" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "WhatsAppChannel_tenantId_selectedForMessaging_idx" ON "WhatsAppChannel"("tenantId", "selectedForMessaging");

ALTER TABLE "WhatsAppChannel" ADD COLUMN "messagingStartedAt" TIMESTAMP(3);
UPDATE "WhatsAppChannel" SET "messagingStartedAt" = "updatedAt" WHERE "selectedForMessaging" = true;

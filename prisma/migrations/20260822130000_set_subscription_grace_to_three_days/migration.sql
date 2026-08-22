ALTER TABLE "BillingSettings"
ALTER COLUMN "postExpirationGraceDays" SET DEFAULT 3;

UPDATE "BillingSettings"
SET "postExpirationGraceDays" = 3,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 1;

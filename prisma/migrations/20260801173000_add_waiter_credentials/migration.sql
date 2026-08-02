ALTER TABLE "Waiter" ADD COLUMN "username" TEXT;
ALTER TABLE "Waiter" ADD COLUMN "password" TEXT;
UPDATE "Waiter" SET "username" = 'garcom-' || "id", "password" = '' WHERE "username" IS NULL;
ALTER TABLE "Waiter" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "Waiter" ALTER COLUMN "password" SET NOT NULL;
CREATE UNIQUE INDEX "Waiter_tenantId_username_key" ON "Waiter"("tenantId", "username");

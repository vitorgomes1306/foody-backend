ALTER TABLE "Tenant" ADD COLUMN "ownerId" INTEGER;

UPDATE "Tenant" t
SET "ownerId" = u."id"
FROM "User" u
WHERE u."tenantId" = t."id"
  AND t."ownerId" IS NULL;

ALTER TABLE "Tenant" ALTER COLUMN "ownerId" SET NOT NULL;

ALTER TABLE "Tenant"
ADD CONSTRAINT "Tenant_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_tenantId_fkey";
DROP INDEX IF EXISTS "User_tenantId_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "tenantId";

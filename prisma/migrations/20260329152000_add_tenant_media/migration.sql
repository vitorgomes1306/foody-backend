-- CreateTable
CREATE TABLE "TenantMedia" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantMedia_tenantId_idx" ON "TenantMedia"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantMedia" ADD CONSTRAINT "TenantMedia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

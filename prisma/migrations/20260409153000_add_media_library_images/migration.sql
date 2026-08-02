-- Enable UUID generation (needed for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE IF NOT EXISTS "MediaLibraryImage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "title" TEXT,
    "uploadedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaLibraryImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MediaLibraryImage_uploadedById_idx" ON "MediaLibraryImage"("uploadedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MediaLibraryImage_createdAt_idx" ON "MediaLibraryImage"("createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MediaLibraryImage_uploadedById_fkey'
  ) THEN
    ALTER TABLE "MediaLibraryImage"
    ADD CONSTRAINT "MediaLibraryImage_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

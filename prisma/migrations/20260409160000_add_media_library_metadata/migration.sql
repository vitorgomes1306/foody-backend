-- AlterTable
ALTER TABLE "MediaLibraryImage" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "MediaLibraryImage" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "MediaLibraryImage" ADD COLUMN IF NOT EXISTS "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MediaLibraryImage_category_idx" ON "MediaLibraryImage"("category");

-- Keywords index (optional but helps search)
CREATE INDEX IF NOT EXISTS "MediaLibraryImage_keywords_gin_idx" ON "MediaLibraryImage" USING GIN ("keywords");


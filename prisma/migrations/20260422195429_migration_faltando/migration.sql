-- DropIndex
DROP INDEX "MediaLibraryImage_category_idx";

-- DropIndex
DROP INDEX "MediaLibraryImage_keywords_gin_idx";

-- AlterTable
ALTER TABLE "MediaLibraryImage" ALTER COLUMN "id" DROP DEFAULT;

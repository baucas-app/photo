-- CreateEnum
CREATE TYPE "AlbumSortOrder" AS ENUM ('takenAt_desc', 'takenAt_asc', 'uploadedAt_desc', 'name_asc');

-- AlterTable
ALTER TABLE "albums"
  ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sort_order" "AlbumSortOrder" NOT NULL DEFAULT 'takenAt_desc';

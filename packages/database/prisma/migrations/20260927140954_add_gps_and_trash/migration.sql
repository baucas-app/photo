-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "location_city" TEXT,
ADD COLUMN     "location_country" TEXT,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "assets_deleted_at_idx" ON "assets"("deleted_at");

-- CreateIndex
CREATE INDEX "assets_latitude_longitude_idx" ON "assets"("latitude", "longitude");

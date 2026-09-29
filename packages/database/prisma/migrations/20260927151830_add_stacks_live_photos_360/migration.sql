-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "is_360" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_live_photo_motion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "live_photo_video_id" TEXT,
ADD COLUMN     "stack_parent_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "assets_live_photo_video_id_key" ON "assets"("live_photo_video_id");

-- CreateIndex
CREATE INDEX "assets_stack_parent_id_idx" ON "assets"("stack_parent_id");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_stack_parent_id_fkey" FOREIGN KEY ("stack_parent_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_live_photo_video_id_fkey" FOREIGN KEY ("live_photo_video_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;


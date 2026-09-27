-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "TagSource" AS ENUM ('user', 'yolo', 'clip');

-- CreateEnum
CREATE TYPE "BackupJobStatus" AS ENUM ('idle', 'running', 'paused', 'error');

-- CreateEnum
CREATE TYPE "ShareRole" AS ENUM ('owner', 'editor', 'viewer');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" INTEGER,
    "mime_type" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration" INTEGER,
    "camera_make" TEXT,
    "camera_model" TEXT,
    "lens_model" TEXT,
    "iso" INTEGER,
    "f_number" DOUBLE PRECISION,
    "exposure_time" DOUBLE PRECISION,
    "focal_length" DOUBLE PRECISION,
    "taken_at" TIMESTAMP(3),
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hash" TEXT,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_embeddings" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "vector" BYTEA NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'clip-vit-b-32',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "albums" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "path" TEXT NOT NULL,
    "parent_id" TEXT,
    "cover_asset_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "album_assets" (
    "id" TEXT NOT NULL,
    "album_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "album_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source" "TagSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faces" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "embedding" BYTEA NOT NULL,
    "sample_asset_id" TEXT,
    "person_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_detections" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "face_id" TEXT,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "w" DOUBLE PRECISION NOT NULL,
    "h" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_detections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_links" (
    "id" TEXT NOT NULL,
    "album_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "password_hash" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_members" (
    "id" TEXT NOT NULL,
    "album_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ShareRole" NOT NULL DEFAULT 'viewer',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "key_hash" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_status" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_backup" TIMESTAMP(3),
    "total_assets" INTEGER NOT NULL DEFAULT 0,
    "backed_up_assets" INTEGER NOT NULL DEFAULT 0,
    "status" "BackupJobStatus" NOT NULL DEFAULT 'idle',
    "error_message" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "assets_user_id_idx" ON "assets"("user_id");

-- CreateIndex
CREATE INDEX "assets_taken_at_idx" ON "assets"("taken_at");

-- CreateIndex
CREATE INDEX "assets_hash_idx" ON "assets"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "asset_embeddings_asset_id_key" ON "asset_embeddings"("asset_id");

-- CreateIndex
CREATE INDEX "albums_parent_id_idx" ON "albums"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "albums_user_id_path_key" ON "albums"("user_id", "path");

-- CreateIndex
CREATE UNIQUE INDEX "album_assets_album_id_asset_id_key" ON "album_assets"("album_id", "asset_id");

-- CreateIndex
CREATE INDEX "tags_label_idx" ON "tags"("label");

-- CreateIndex
CREATE INDEX "tags_asset_id_idx" ON "tags"("asset_id");

-- CreateIndex
CREATE INDEX "faces_user_id_idx" ON "faces"("user_id");

-- CreateIndex
CREATE INDEX "face_detections_asset_id_idx" ON "face_detections"("asset_id");

-- CreateIndex
CREATE INDEX "face_detections_face_id_idx" ON "face_detections"("face_id");

-- CreateIndex
CREATE UNIQUE INDEX "shared_links_album_id_key" ON "shared_links"("album_id");

-- CreateIndex
CREATE UNIQUE INDEX "shared_links_token_key" ON "shared_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "shared_members_album_id_user_id_key" ON "shared_members"("album_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "backup_status_user_id_key" ON "backup_status"("user_id");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_embeddings" ADD CONSTRAINT "asset_embeddings_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_cover_asset_id_fkey" FOREIGN KEY ("cover_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_assets" ADD CONSTRAINT "album_assets_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_assets" ADD CONSTRAINT "album_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faces" ADD CONSTRAINT "faces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faces" ADD CONSTRAINT "faces_sample_asset_id_fkey" FOREIGN KEY ("sample_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_detections" ADD CONSTRAINT "face_detections_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_detections" ADD CONSTRAINT "face_detections_face_id_fkey" FOREIGN KEY ("face_id") REFERENCES "faces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_links" ADD CONSTRAINT "shared_links_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_links" ADD CONSTRAINT "shared_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_members" ADD CONSTRAINT "shared_members_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_members" ADD CONSTRAINT "shared_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_status" ADD CONSTRAINT "backup_status_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

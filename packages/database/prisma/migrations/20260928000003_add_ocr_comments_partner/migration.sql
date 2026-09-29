-- OCR text on assets
ALTER TABLE "assets" ADD COLUMN "ocr_text" TEXT;

-- Album comments
CREATE TABLE "album_comments" (
    "id"         TEXT NOT NULL,
    "album_id"   TEXT NOT NULL,
    "user_id"    TEXT NOT NULL,
    "body"       TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "album_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "album_comments_album_id_idx" ON "album_comments"("album_id");

ALTER TABLE "album_comments" ADD CONSTRAINT "album_comments_album_id_fkey"
    FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "album_comments" ADD CONSTRAINT "album_comments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partner / family library sharing
CREATE TYPE "LibraryShareStatus" AS ENUM ('pending', 'accepted');

CREATE TABLE "library_shares" (
    "id"           TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_user_id"   TEXT NOT NULL,
    "status"       "LibraryShareStatus" NOT NULL DEFAULT 'pending',
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "library_shares_from_user_id_to_user_id_key"
    ON "library_shares"("from_user_id", "to_user_id");

ALTER TABLE "library_shares" ADD CONSTRAINT "library_shares_from_user_id_fkey"
    FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "library_shares" ADD CONSTRAINT "library_shares_to_user_id_fkey"
    FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

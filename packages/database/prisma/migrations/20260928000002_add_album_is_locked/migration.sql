-- AlterTable
ALTER TABLE "albums" ADD COLUMN "is_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lock_password_hash" TEXT;

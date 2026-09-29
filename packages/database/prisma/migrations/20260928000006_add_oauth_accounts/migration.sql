-- Allow password-less accounts (OAuth-only users)
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- OAuth accounts table
CREATE TABLE "oauth_accounts" (
    "id"          TEXT        NOT NULL,
    "user_id"     TEXT        NOT NULL,
    "provider"    TEXT        NOT NULL,
    "provider_id" TEXT        NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_accounts_provider_provider_id_key"
    ON "oauth_accounts"("provider", "provider_id");

CREATE INDEX "oauth_accounts_user_id_idx"
    ON "oauth_accounts"("user_id");

ALTER TABLE "oauth_accounts"
    ADD CONSTRAINT "oauth_accounts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

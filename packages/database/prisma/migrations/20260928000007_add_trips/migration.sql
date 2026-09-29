CREATE TABLE "trips" (
    "id"            TEXT         NOT NULL,
    "user_id"       TEXT         NOT NULL,
    "name"          TEXT         NOT NULL,
    "start_date"    TIMESTAMP(3) NOT NULL,
    "end_date"      TIMESTAMP(3) NOT NULL,
    "center_lat"    DOUBLE PRECISION,
    "center_lon"    DOUBLE PRECISION,
    "location_name" TEXT,
    "cover_asset_id" TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trip_assets" (
    "trip_id"  TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,

    CONSTRAINT "trip_assets_pkey" PRIMARY KEY ("trip_id","asset_id")
);

CREATE INDEX "trips_user_id_idx"      ON "trips"("user_id");
CREATE INDEX "trips_start_date_idx"   ON "trips"("start_date");

ALTER TABLE "trips"
    ADD CONSTRAINT "trips_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trips"
    ADD CONSTRAINT "trips_cover_asset_id_fkey"
    FOREIGN KEY ("cover_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "trip_assets"
    ADD CONSTRAINT "trip_assets_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trip_assets"
    ADD CONSTRAINT "trip_assets_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

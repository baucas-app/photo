-- CreateTable: user-created hierarchical labels (distinct from YOLO Tag)
CREATE TABLE "user_labels" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "parent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable: asset <-> user_label junction
CREATE TABLE "asset_labels" (
    "asset_id" TEXT NOT NULL,
    "label_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_labels_pkey" PRIMARY KEY ("asset_id","label_id")
);

-- CreateIndex
CREATE INDEX "user_labels_user_id_idx" ON "user_labels"("user_id");
CREATE INDEX "user_labels_parent_id_idx" ON "user_labels"("parent_id");
CREATE INDEX "asset_labels_asset_id_idx" ON "asset_labels"("asset_id");
CREATE INDEX "asset_labels_label_id_idx" ON "asset_labels"("label_id");

-- AddForeignKey
ALTER TABLE "user_labels" ADD CONSTRAINT "user_labels_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_labels" ADD CONSTRAINT "user_labels_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "user_labels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "asset_labels" ADD CONSTRAINT "asset_labels_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asset_labels" ADD CONSTRAINT "asset_labels_label_id_fkey"
    FOREIGN KEY ("label_id") REFERENCES "user_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

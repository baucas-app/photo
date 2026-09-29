/**
 * One-time backfill for assets whose mimeType was stored as
 * 'application/octet-stream' (or null) before the iOS upload fix in
 * APIClient.upload() (see docs/DONE.md, Teil 3 / Teil 8).
 *
 * Those rows have the correct filename, so we re-derive the MIME type from the
 * extension using the same logic as resolveMimeType() in mediaType.ts.
 * After the fix, Asset.isVideo and thumbnail rendering work correctly for all
 * historical iOS uploads.
 *
 * Idempotent: rows that already have a specific type are left untouched.
 *
 * Run once after deploying the upload fix:
 *   cd backend && npx tsx scripts/backfill-mime-types.ts
 */
import path from "node:path";
import { prisma } from "../src/db/prisma.js";

const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".hif": "image/heif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".bmp": "image/bmp",
  ".dng": "image/x-adobe-dng",
  ".cr2": "image/x-canon-cr2",
  ".cr3": "image/x-canon-cr3",
  ".nef": "image/x-nikon-nef",
  ".arw": "image/x-sony-arw",
  ".raf": "image/x-fuji-raf",
  ".orf": "image/x-olympus-orf",
  ".rw2": "image/x-panasonic-rw2",
  ".pef": "image/x-pentax-pef",
  ".srw": "image/x-samsung-srw",
  ".mov": "video/quicktime",
  ".qt": "video/quicktime",
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".3gp": "video/3gpp",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mts": "video/mp2t",
  ".m2ts": "video/mp2t",
};

async function run() {
  const assets = await prisma.asset.findMany({
    where: {
      OR: [{ mimeType: null }, { mimeType: "application/octet-stream" }, { mimeType: "binary/octet-stream" }],
    },
    select: { id: true, filename: true, mimeType: true },
  });

  console.log(`Found ${assets.length} asset(s) with generic/missing MIME type.`);
  if (assets.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let updated = 0;
  let skipped = 0;
  for (const asset of assets) {
    const ext = path.extname(asset.filename).toLowerCase();
    const resolved = EXTENSION_MIME_TYPES[ext];
    if (!resolved) {
      console.log(`  SKIP  ${asset.id}  (${asset.filename}) — unknown extension '${ext}'`);
      skipped++;
      continue;
    }
    await prisma.asset.update({ where: { id: asset.id }, data: { mimeType: resolved } });
    console.log(`  FIX   ${asset.id}  ${asset.filename}  →  ${resolved}`);
    updated++;
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped (unknown extension).`);
}

run()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());

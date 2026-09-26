import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { env } from "../config/env.js";
import { toAbsolutePath } from "./filesystem.service.js";

const THUMBNAIL_SIZE = 400;

function thumbnailPath(assetId: string): string {
  return path.join(env.thumbnailCacheRoot, `${assetId}.webp`);
}

export async function getOrCreateThumbnail(assetId: string, relativePath: string): Promise<string> {
  const cachePath = thumbnailPath(assetId);

  try {
    await fs.access(cachePath);
    return cachePath;
  } catch {
    // Not cached yet - fall through and generate it once, below.
  }

  await fs.mkdir(env.thumbnailCacheRoot, { recursive: true });
  await sharp(toAbsolutePath(relativePath))
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: "cover" })
    .webp({ quality: 80 })
    .toFile(cachePath);

  return cachePath;
}

export async function invalidateThumbnail(assetId: string): Promise<void> {
  await fs.rm(thumbnailPath(assetId), { force: true });
}

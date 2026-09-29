import { promises as fs } from "node:fs";
import sharp from "sharp";
import { prisma } from "../db/prisma.js";
import { BadRequest, NotFound } from "../utils/httpError.js";
import { toAbsolutePath } from "./filesystem.service.js";
import { openImage } from "./imageDecoder.service.js";
import { invalidateThumbnail } from "./thumbnail.service.js";
import { computePerceptualHash } from "./hash.service.js";

export interface EditOperations {
  rotate?: 90 | 180 | 270 | -90;
  crop?: { left: number; top: number; width: number; height: number };
  brightness?: number; // -100..100, 0 = unchanged
  contrast?: number; // -100..100, 0 = unchanged
}

/** Sibling file, e.g. "/u/2026/09/photo.jpg" -> "/u/2026/09/photo.jpg.original" */
function backupRelativePath(relativePath: string): string {
  return `${relativePath}.original`;
}

async function fileExists(absolutePath: string): Promise<boolean> {
  return fs.access(absolutePath).then(
    () => true,
    () => false,
  );
}

async function applyToDisk(sourceAbsolutePath: string, targetAbsolutePath: string, ops: EditOperations) {
  let pipeline = await openImage(sourceAbsolutePath);

  if (ops.crop) {
    pipeline = pipeline.extract({
      left: Math.round(ops.crop.left),
      top: Math.round(ops.crop.top),
      width: Math.round(ops.crop.width),
      height: Math.round(ops.crop.height),
    });
  }
  if (ops.rotate) {
    pipeline = pipeline.rotate(ops.rotate);
  }
  if (ops.brightness) {
    pipeline = pipeline.modulate({ brightness: 1 + ops.brightness / 100 });
  }
  if (ops.contrast) {
    // sharp's linear(a, b) maps each pixel to a*pixel + b - scaling around
    // the 128 midpoint keeps mid-grey fixed, the usual "contrast" behaviour.
    const factor = 1 + ops.contrast / 100;
    pipeline = pipeline.linear(factor, 128 * (1 - factor));
  }

  const buffer = await pipeline.toBuffer();
  await fs.writeFile(targetAbsolutePath, buffer);
}

async function refreshAssetFromDisk(assetId: string, absolutePath: string) {
  const meta = await sharp(absolutePath).metadata();
  const stat = await fs.stat(absolutePath);
  const hash = await computePerceptualHash(absolutePath).catch(() => undefined);

  await invalidateThumbnail(assetId);
  return prisma.asset.update({
    where: { id: assetId },
    data: {
      width: meta.width,
      height: meta.height,
      size: stat.size,
      ...(hash ? { hash } : {}),
    },
  });
}

/**
 * Non-destructive: the very first edit backs up the pristine file next to it
 * (".original" suffix) and every edit re-applies its full operation set to
 * *that* backup rather than stacking onto the last edit - so cropping then
 * later straightening never compounds JPEG re-encode loss, and `revertAsset`
 * always has something to go back to.
 */
export async function editAsset(userId: string, assetId: string, ops: EditOperations) {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId, deletedAt: null } });
  if (!asset) throw NotFound("Asset not found");
  if (!asset.mimeType?.startsWith("image/")) throw BadRequest("Only images can be edited");
  if (!ops.rotate && !ops.crop && !ops.brightness && !ops.contrast) {
    throw BadRequest("No edit operations given");
  }

  const targetAbsolute = toAbsolutePath(asset.path);
  const backupRelative = backupRelativePath(asset.path);
  const backupAbsolute = toAbsolutePath(backupRelative);

  if (!(await fileExists(backupAbsolute))) {
    await fs.copyFile(targetAbsolute, backupAbsolute);
  }

  await applyToDisk(backupAbsolute, targetAbsolute, ops);
  return refreshAssetFromDisk(asset.id, targetAbsolute);
}

export async function revertAsset(userId: string, assetId: string) {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId, deletedAt: null } });
  if (!asset) throw NotFound("Asset not found");

  const backupAbsolute = toAbsolutePath(backupRelativePath(asset.path));
  if (!(await fileExists(backupAbsolute))) {
    throw BadRequest("This photo has no edits to revert");
  }

  const targetAbsolute = toAbsolutePath(asset.path);
  await fs.copyFile(backupAbsolute, targetAbsolute);
  return refreshAssetFromDisk(asset.id, targetAbsolute);
}

export async function hasEdits(userId: string, assetId: string): Promise<boolean> {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId } });
  if (!asset) throw NotFound("Asset not found");
  return fileExists(toAbsolutePath(backupRelativePath(asset.path)));
}

import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "../db/prisma.js";
import { BadRequest, NotFound } from "../utils/httpError.js";
import { extractImageMetadata, type ExtractedMetadata } from "./exif.service.js";
import { toAbsolutePath, ensureDir, deleteFile, removeEmptyDir } from "./filesystem.service.js";
import { computePerceptualHash } from "./hash.service.js";
import { enqueueMlPipeline } from "../queues/mlQueue.js";
import { invalidateThumbnail } from "./thumbnail.service.js";
import { yearMonthFolder } from "./filesystem.service.js";
import { resolveMimeType } from "../utils/mediaType.js";
import { extractVideoMetadata } from "./videoFrame.service.js";

export interface UploadedFile {
  tempPath: string;
  originalName: string;
  mimeType: string;
}

/**
 * Moves the uploaded temp file to `dir/filename`, appending " (n)" on name
 * collisions. The target is claimed atomically (link()/COPYFILE_EXCL both
 * fail with EEXIST instead of overwriting), so two concurrent uploads of the
 * same filename - e.g. IMG_0001.JPG from two iPhones - can't clobber each
 * other the way a separate access()-then-rename() check could. copyFile is
 * the fallback for EXDEV: in Docker the multer temp dir (/tmp) and the
 * library volume (/photos) are different filesystems, where rename()/link()
 * always fail.
 */
export async function placeFileUniquely(tempPath: string, dir: string, filename: string): Promise<string> {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);

  for (let attempt = 0; attempt < 10_000; attempt++) {
    const candidate = attempt === 0 ? `${dir}/${filename}` : `${dir}/${base} (${attempt})${ext}`;
    const target = toAbsolutePath(candidate);
    try {
      try {
        await fs.link(tempPath, target);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EEXIST") throw error;
        await fs.copyFile(tempPath, target, fsConstants.COPYFILE_EXCL);
      }
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
  }
  throw new Error(`Could not find a free filename for ${filename} in ${dir}`);
}

export interface LivePhotoOptions {
  /** This upload IS the motion/video component - hide it from every normal
   * listing, it's only ever reached through the still it belongs to. */
  isMotionComponent?: boolean;
  /** This upload is the still photo of a Live Photo whose video component
   * was already uploaded (as isMotionComponent) - pairs the two. */
  motionAssetId?: string;
}

/** Client-supplied metadata used as fallback when EXIF extraction returns null
 * (e.g. screenshots, photos edited by apps that strip EXIF). */
export interface ClientMetadata {
  takenAt?: Date;
  latitude?: number;
  longitude?: number;
}

export async function ingestUploadedAsset(
  userId: string,
  file: UploadedFile,
  albumId?: string,
  livePhoto?: LivePhotoOptions,
  clientMeta?: ClientMetadata,
) {
  try {
    return await ingestFromTemp(userId, file, albumId, livePhoto, clientMeta);
  } finally {
    // The temp file is either hard-linked/copied into the library by now or
    // the upload failed (unknown album, ...) - either way it must not pile up in /tmp.
    await fs.rm(file.tempPath, { force: true }).catch(() => {});
  }
}

async function ingestFromTemp(userId: string, file: UploadedFile, albumId?: string, livePhoto?: LivePhotoOptions, clientMeta?: ClientMetadata) {
  // The iOS app sends every file as application/octet-stream - without this,
  // iPhone HEIC/MOV uploads got no metadata, no hash and no video player.
  const mimeType = resolveMimeType(file.mimeType, file.originalName);
  const isImage = mimeType.startsWith("image/");

  const emptyMetadata: ExtractedMetadata = {
    width: null,
    height: null,
    takenAt: null,
    cameraMake: null,
    cameraModel: null,
    lensModel: null,
    iso: null,
    fNumber: null,
    exposureTime: null,
    focalLength: null,
    latitude: null,
    longitude: null,
    is360: false,
  };
  const metadata = isImage ? await extractImageMetadata(file.tempPath) : emptyMetadata;

  // Video equivalent of extractImageMetadata's EXIF read: duration for the
  // player UI, creation_time as the takenAt fallback (used below for both
  // the DB row and, same as photos, picking the year/month upload folder
  // when there's no album target).
  let duration: number | null = null;
  if (mimeType.startsWith("video/")) {
    const videoMetadata = await extractVideoMetadata(file.tempPath);
    duration = videoMetadata.durationSeconds;
    metadata.takenAt = videoMetadata.takenAt;
  }

  // Apply client-supplied metadata as fallback for fields EXIF didn't provide.
  if (clientMeta?.takenAt && !isNaN(clientMeta.takenAt.getTime())) {
    metadata.takenAt ??= clientMeta.takenAt;
  }
  if (clientMeta?.latitude != null && isFinite(clientMeta.latitude)) {
    metadata.latitude ??= clientMeta.latitude;
  }
  if (clientMeta?.longitude != null && isFinite(clientMeta.longitude)) {
    metadata.longitude ??= clientMeta.longitude;
  }

  // Validated before any file move so a bad pairing fails fast, not after
  // the upload has already landed on disk.
  if (livePhoto?.motionAssetId) {
    const video = await prisma.asset.findFirst({
      where: { id: livePhoto.motionAssetId, userId, isLivePhotoMotion: true },
    });
    if (!video) throw BadRequest("Live Photo video component not found");
    const alreadyPaired = await prisma.asset.findFirst({ where: { livePhotoVideoId: video.id } });
    if (alreadyPaired) throw BadRequest("Live Photo video component is already paired with another photo");
  }

  let targetDir: string;
  if (albumId) {
    const album = await prisma.album.findFirst({ where: { id: albumId, userId } });
    if (!album) {
      throw NotFound("Album not found");
    }
    targetDir = album.path;
  } else {
    targetDir = yearMonthFolder(userId, metadata.takenAt ?? new Date());
  }

  await ensureDir(targetDir);
  // Only the final path component of the client-supplied name is used.
  const baseName = path.basename(file.originalName.replace(/\\/g, "/"));
  const safeName = baseName && baseName !== "." && baseName !== ".." ? baseName : "upload";
  const relativePath = await placeFileUniquely(file.tempPath, targetDir, safeName);

  const stat = await fs.stat(toAbsolutePath(relativePath));
  const hash = isImage ? await computePerceptualHash(toAbsolutePath(relativePath)).catch(() => null) : null;

  const asset = await prisma.asset.create({
    data: {
      userId,
      filename: path.basename(relativePath),
      path: relativePath,
      size: stat.size,
      mimeType,
      width: metadata.width,
      height: metadata.height,
      duration,
      takenAt: metadata.takenAt,
      cameraMake: metadata.cameraMake,
      cameraModel: metadata.cameraModel,
      lensModel: metadata.lensModel,
      iso: metadata.iso,
      fNumber: metadata.fNumber,
      exposureTime: metadata.exposureTime,
      focalLength: metadata.focalLength,
      latitude: metadata.latitude,
      longitude: metadata.longitude,
      is360: metadata.is360,
      isLivePhotoMotion: livePhoto?.isMotionComponent ?? false,
      livePhotoVideoId: livePhoto?.motionAssetId,
      hash,
    },
  });

  if (albumId) {
    await prisma.albumAsset.create({ data: { albumId, assetId: asset.id } });
  }

  await enqueueMlPipeline({ assetId: asset.id, userId, relativePath: asset.path });

  return asset;
}

/** Default DELETE /:id behaviour: moves the asset to the trash instead of
 * removing anything - the file stays on disk untouched so `restoreAsset`
 * and thumbnail/preview/file serving keep working while it sits there. */
export async function trashAsset(userId: string, assetId: string): Promise<void> {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId, deletedAt: null } });
  if (!asset) {
    throw NotFound("Asset not found");
  }
  await prisma.asset.update({ where: { id: asset.id }, data: { deletedAt: new Date() } });
}

export async function restoreAsset(userId: string, assetId: string): Promise<void> {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId, deletedAt: { not: null } } });
  if (!asset) {
    throw NotFound("Asset not found in trash");
  }
  await prisma.asset.update({ where: { id: asset.id }, data: { deletedAt: null } });
}

/** Actually removes an asset (file + DB row) - only reachable for assets
 * already in the trash, so "delete forever" can't skip the trash step. */
export async function permanentlyDeleteAsset(userId: string, assetId: string): Promise<void> {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId, deletedAt: { not: null } } });
  if (!asset) {
    throw NotFound("Asset not found in trash");
  }

  await prisma.asset.delete({ where: { id: asset.id } });
  await deleteFile(asset.path);
  await deleteFile(`${asset.path}.original`); // edit.service.ts's backup, if any
  await invalidateThumbnail(asset.id);
  await removeEmptyDir(path.posix.dirname(asset.path));
}

const TRASH_RETENTION_DAYS = 30;

/** Hard-deletes anything that's been sitting in the trash past the
 * retention window - called on a timer from index.ts, mirrors Immich's/
 * Apple's "Recently Deleted, 30 days" behaviour. */
export async function purgeExpiredTrash(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await prisma.asset.findMany({ where: { deletedAt: { lt: cutoff } } });

  for (const asset of expired) {
    await prisma.asset.delete({ where: { id: asset.id } });
    await deleteFile(asset.path);
    await deleteFile(`${asset.path}.original`);
    await invalidateThumbnail(asset.id);
    await removeEmptyDir(path.posix.dirname(asset.path));
  }

  return expired.length;
}

// MARK: - Stacks (manual grouping, e.g. burst shots)

/** Groups several assets into one stack: all but the primary get their
 * stackParentId set to it, which hides them from normal listings (see the
 * `stackParentId: null` filter added to every browsing endpoint) - they only
 * show up again when the stack's primary tile is expanded. */
export async function stackAssets(userId: string, assetIds: string[], primaryAssetId?: string): Promise<void> {
  const uniqueIds = [...new Set(assetIds)];
  if (uniqueIds.length < 2) throw BadRequest("A stack needs at least 2 photos");

  const assets = await prisma.asset.findMany({ where: { id: { in: uniqueIds }, userId } });
  if (assets.length !== uniqueIds.length) throw NotFound("One or more assets not found");
  if (assets.some((asset) => asset.stackParentId !== null)) {
    throw BadRequest("An asset already in a stack must be removed from it first");
  }
  if (await prisma.asset.count({ where: { stackParentId: { in: uniqueIds } } })) {
    throw BadRequest("An asset that's already a stack's cover must be unstacked first");
  }

  const primary = primaryAssetId ?? uniqueIds[0];
  if (typeof primary !== "string" || !uniqueIds.includes(primary)) {
    throw BadRequest("primaryAssetId must be one of assetIds");
  }

  await prisma.asset.updateMany({
    where: { id: { in: uniqueIds.filter((id) => id !== primary) } },
    data: { stackParentId: primary },
  });
}

/** Removes one asset from its stack (if it's a member) or, if it's the
 * stack's primary, dissolves the whole thing - every member just becomes an
 * independent asset again, there's no "picking a new cover". */
export async function unstackAsset(userId: string, assetId: string): Promise<void> {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId } });
  if (!asset) throw NotFound("Asset not found");

  if (asset.stackParentId) {
    await prisma.asset.update({ where: { id: asset.id }, data: { stackParentId: null } });
    return;
  }
  await prisma.asset.updateMany({ where: { stackParentId: asset.id }, data: { stackParentId: null } });
}

/** The full stack (primary + every child) that `assetId` belongs to,
 * regardless of whether it's the primary or one of the children - for the
 * "expand this stack" UI. */
export async function getStackMembers(userId: string, assetId: string) {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId } });
  if (!asset) throw NotFound("Asset not found");

  const primaryId = asset.stackParentId ?? asset.id;
  return prisma.asset.findMany({
    where: { userId, OR: [{ id: primaryId }, { stackParentId: primaryId }] },
    orderBy: [{ takenAt: "desc" }, { uploadedAt: "desc" }],
  });
}

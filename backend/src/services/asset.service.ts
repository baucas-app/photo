import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "../db/prisma.js";
import { NotFound } from "../utils/httpError.js";
import { extractImageMetadata } from "./exif.service.js";
import { toAbsolutePath, ensureDir, deleteFile, removeEmptyDir } from "./filesystem.service.js";
import { computePerceptualHash } from "./hash.service.js";
import { enqueueMlPipeline } from "../queues/mlQueue.js";
import { invalidateThumbnail } from "./thumbnail.service.js";
import { yearMonthFolder } from "./filesystem.service.js";

export interface UploadedFile {
  tempPath: string;
  originalName: string;
  mimeType: string;
}

async function uniqueRelativePath(dir: string, filename: string): Promise<string> {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);

  let candidate = `${dir}/${filename}`;
  let attempt = 1;
  while (await fs.access(toAbsolutePath(candidate)).then(() => true, () => false)) {
    candidate = `${dir}/${base} (${attempt})${ext}`;
    attempt += 1;
  }
  return candidate;
}

export async function ingestUploadedAsset(userId: string, file: UploadedFile, albumId?: string) {
  const isImage = file.mimeType.startsWith("image/");

  const metadata = isImage
    ? await extractImageMetadata(file.tempPath)
    : { width: null, height: null, takenAt: null, cameraMake: null, cameraModel: null };

  let targetDir: string;
  if (albumId) {
    const album = await prisma.album.findFirst({ where: { id: albumId, userId } });
    if (!album) {
      throw NotFound("Album not found");
    }
    targetDir = album.path;
  } else {
    targetDir = yearMonthFolder(metadata.takenAt ?? new Date());
  }

  await ensureDir(targetDir);
  const relativePath = await uniqueRelativePath(targetDir, file.originalName);

  await fs.rename(file.tempPath, toAbsolutePath(relativePath));

  const stat = await fs.stat(toAbsolutePath(relativePath));
  const hash = isImage ? await computePerceptualHash(toAbsolutePath(relativePath)).catch(() => null) : null;

  const asset = await prisma.asset.create({
    data: {
      userId,
      filename: path.basename(relativePath),
      path: relativePath,
      size: stat.size,
      mimeType: file.mimeType,
      width: metadata.width,
      height: metadata.height,
      takenAt: metadata.takenAt,
      cameraMake: metadata.cameraMake,
      cameraModel: metadata.cameraModel,
      hash,
    },
  });

  if (albumId) {
    await prisma.albumAsset.create({ data: { albumId, assetId: asset.id } });
  }

  await enqueueMlPipeline({ assetId: asset.id, userId, relativePath: asset.path });

  return asset;
}

export async function deleteAsset(userId: string, assetId: string): Promise<void> {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId } });
  if (!asset) {
    throw NotFound("Asset not found");
  }

  await prisma.asset.delete({ where: { id: asset.id } });
  await deleteFile(asset.path);
  await invalidateThumbnail(asset.id);
  await removeEmptyDir(path.posix.dirname(asset.path));
}

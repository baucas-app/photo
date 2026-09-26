import { prisma } from "../db/prisma.js";
import { BadRequest, NotFound } from "../utils/httpError.js";
import { ensureDir, removeEmptyDir } from "./filesystem.service.js";

export async function createAlbum(userId: string, name: string, parentId?: string) {
  let parentPath = "";

  if (parentId) {
    const parent = await prisma.album.findFirst({ where: { id: parentId, userId } });
    if (!parent) throw NotFound("Parent album not found");
    parentPath = parent.path;
  }

  const albumPath = `${parentPath}/${name}`;

  const existing = await prisma.album.findFirst({ where: { userId, path: albumPath } });
  if (existing) throw BadRequest("An album with this name already exists in this location");

  await ensureDir(albumPath);

  return prisma.album.create({
    data: { userId, name, path: albumPath, parentId },
  });
}

export async function updateAlbum(
  userId: string,
  albumId: string,
  data: { name?: string; description?: string },
) {
  const album = await prisma.album.findFirst({ where: { id: albumId, userId } });
  if (!album) throw NotFound("Album not found");

  // Renaming keeps the folder path stable; moving the underlying directory
  // (and every descendant album's path) is a bigger operation left for later.
  return prisma.album.update({ where: { id: album.id }, data });
}

export async function deleteAlbum(userId: string, albumId: string): Promise<void> {
  const album = await prisma.album.findFirst({ where: { id: albumId, userId } });
  if (!album) throw NotFound("Album not found");

  const childCount = await prisma.album.count({ where: { parentId: albumId } });
  if (childCount > 0) {
    throw BadRequest("Delete or move sub-albums first");
  }

  await prisma.album.delete({ where: { id: album.id } });
  await removeEmptyDir(album.path);
}

export async function addAssetsToAlbum(userId: string, albumId: string, assetIds: string[]): Promise<void> {
  const album = await prisma.album.findFirst({ where: { id: albumId, userId } });
  if (!album) throw NotFound("Album not found");

  const ownedAssets = await prisma.asset.findMany({
    where: { id: { in: assetIds }, userId },
    select: { id: true },
  });

  await prisma.albumAsset.createMany({
    data: ownedAssets.map((asset) => ({ albumId, assetId: asset.id })),
    skipDuplicates: true,
  });
}

export async function removeAssetFromAlbum(userId: string, albumId: string, assetId: string): Promise<void> {
  const album = await prisma.album.findFirst({ where: { id: albumId, userId } });
  if (!album) throw NotFound("Album not found");

  await prisma.albumAsset.deleteMany({ where: { albumId, assetId } });
}

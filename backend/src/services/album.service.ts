import { prisma } from "../db/prisma.js";
import { BadRequest, NotFound } from "../utils/httpError.js";
import { ensureDir, removeEmptyDir, renameEntry } from "./filesystem.service.js";

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

  if (data.name === undefined || data.name === album.name) {
    return prisma.album.update({ where: { id: album.id }, data: { description: data.description } });
  }

  return renameAlbumFolder(userId, album, data.name, data.description);
}

/**
 * The filesystem is the source of truth for files, so renaming an album
 * moves its real directory (dragging every file and sub-album with it) and
 * then fixes up every DB row whose `path` was cached under the old prefix -
 * the album itself, every descendant album, and every asset nested anywhere
 * inside it.
 */
async function renameAlbumFolder(
  userId: string,
  album: { id: string; path: string; parentId: string | null },
  newName: string,
  description: string | undefined,
) {
  let parentPath = "";
  if (album.parentId) {
    const parent = await prisma.album.findFirst({ where: { id: album.parentId, userId } });
    parentPath = parent?.path ?? "";
  }

  const oldPath = album.path;
  const newPath = `${parentPath}/${newName}`;

  const conflict = await prisma.album.findFirst({ where: { userId, path: newPath } });
  if (conflict) throw BadRequest("An album with this name already exists in this location");

  await renameEntry(oldPath, newPath);

  const [descendantAlbums, nestedAssets] = await Promise.all([
    prisma.album.findMany({ where: { userId, path: { startsWith: `${oldPath}/` } } }),
    prisma.asset.findMany({ where: { userId, path: { startsWith: `${oldPath}/` } } }),
  ]);

  await prisma.$transaction([
    prisma.album.update({
      where: { id: album.id },
      data: { name: newName, path: newPath, description },
    }),
    ...descendantAlbums.map((descendant) =>
      prisma.album.update({
        where: { id: descendant.id },
        data: { path: newPath + descendant.path.slice(oldPath.length) },
      }),
    ),
    ...nestedAssets.map((asset) =>
      prisma.asset.update({
        where: { id: asset.id },
        data: { path: newPath + asset.path.slice(oldPath.length) },
      }),
    ),
  ]);

  return prisma.album.findUniqueOrThrow({ where: { id: album.id } });
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

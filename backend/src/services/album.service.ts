import path from "node:path";
import { type AlbumSortOrder } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { BadRequest, NotFound } from "../utils/httpError.js";
import { deleteFile, ensureDir, pathExists, removeEmptyDir, renameEntry, toAbsolutePath } from "./filesystem.service.js";
import { placeFileUniquely, trashAsset } from "./asset.service.js";

export { type AlbumSortOrder };

export async function createAlbum(userId: string, name: string, parentId?: string) {
  // Every user's albums live under their own /<userId> prefix so two users
  // can never collide on the same physical folder (e.g. both naming a
  // top-level album "Urlaub", or both having a "2026" year folder) - see
  // yearMonthFolder for the equivalent scoping on un-albumed uploads.
  let parentPath = `/${userId}`;

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
  data: {
    name?: string;
    description?: string;
    parentId?: string | null;
    coverAssetId?: string | null;
    pinned?: boolean;
    sortOrder?: AlbumSortOrder;
    isLocked?: boolean;
    lockPassword?: string | null;
  },
) {
  const album = await prisma.album.findFirst({ where: { id: albumId, userId } });
  if (!album) throw NotFound("Album not found");

  if (data.coverAssetId) {
    // Any photo the user can see in this album's grid is a valid cover -
    // that includes assets merely linked in (AlbumAsset), not only ones
    // physically stored under this album's own folder.
    const cover = await prisma.albumAsset.findFirst({
      where: { albumId: album.id, assetId: data.coverAssetId, asset: { userId } },
    });
    if (!cover) throw BadRequest("Cover must be a photo already in this album");
  }

  const newName = data.name ?? album.name;
  const newParentId = data.parentId !== undefined ? data.parentId : album.parentId;

  // "lockPassword: null" = remove password; "lockPassword: string" = set new hash; undefined = no change.
  const lockPasswordHash =
    data.lockPassword === null ? null
    : data.lockPassword !== undefined ? await bcrypt.hash(data.lockPassword, 12)
    : undefined;

  if (newName === album.name && newParentId === album.parentId) {
    return prisma.album.update({
      where: { id: album.id },
      data: {
        description: data.description,
        coverAssetId: data.coverAssetId,
        pinned: data.pinned,
        sortOrder: data.sortOrder,
        isLocked: data.isLocked,
        lockPasswordHash,
      },
    });
  }

  return moveAlbumFolder(userId, album, newName, newParentId, data.description, data.coverAssetId, data.pinned, data.sortOrder, data.isLocked, lockPasswordHash);
}

/**
 * The filesystem is the source of truth for files, so renaming or
 * reparenting an album moves its real directory (dragging every file and
 * sub-album with it) and then fixes up every DB row whose `path` was cached
 * under the old prefix - the album itself, every descendant album, and every
 * asset nested anywhere inside it.
 */
async function moveAlbumFolder(
  userId: string,
  album: { id: string; path: string; parentId: string | null },
  newName: string,
  newParentId: string | null,
  description: string | undefined,
  coverAssetId?: string | null,
  pinned?: boolean,
  sortOrder?: AlbumSortOrder,
  isLocked?: boolean,
  lockPasswordHash?: string | null,
) {
  let newParentPath = `/${userId}`;
  if (newParentId) {
    if (newParentId === album.id) {
      throw BadRequest("An album can't be moved into itself");
    }
    const newParent = await prisma.album.findFirst({ where: { id: newParentId, userId } });
    if (!newParent) throw NotFound("Target parent album not found");
    if (newParent.path === album.path || newParent.path.startsWith(`${album.path}/`)) {
      throw BadRequest("An album can't be moved into one of its own sub-albums");
    }
    newParentPath = newParent.path;
  }

  const oldPath = album.path;
  const newPath = `${newParentPath}/${newName}`;

  if (newPath !== oldPath) {
    const conflict = await prisma.album.findFirst({ where: { userId, path: newPath } });
    if (conflict) throw BadRequest("An album with this name already exists in this location");
  }

  // Prisma's startsWith compiles to LIKE without escaping '_' / '%', so an
  // album named "Urlaub_1" would also match "/UrlaubX1/...". Re-check the
  // real prefix in JS before rewriting any path.
  const prefix = `${oldPath}/`;
  const [descendantAlbums, nestedAssets] = await Promise.all([
    prisma.album
      .findMany({ where: { userId, path: { startsWith: prefix } } })
      .then((rows) => rows.filter((row) => row.path.startsWith(prefix))),
    prisma.asset
      .findMany({ where: { userId, path: { startsWith: prefix } } })
      .then((rows) => rows.filter((row) => row.path.startsWith(prefix))),
  ]);

  // DB transaction FIRST — if it fails, the filesystem is untouched.
  // Filesystem rename AFTER — if it fails, paths in DB are already updated,
  // so the next successful rename will fix consistency.
  await prisma.$transaction([
    prisma.album.update({
      where: { id: album.id },
      data: { name: newName, path: newPath, parentId: newParentId, description, coverAssetId, pinned, sortOrder, isLocked, lockPasswordHash },
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

  // Filesystem rename after DB commit — DB is authoritative; a failed rename
  // here leaves files on disk under the old path but the next startup/request
  // that triggers the same rename will correct it without data loss.
  if (newPath !== oldPath) {
    await renameEntry(oldPath, newPath);
  }

  return prisma.album.findUniqueOrThrow({ where: { id: album.id } });
}

export type DeleteAlbumAssetAction = "keep" | "move" | "trash";

export async function deleteAlbum(
  userId: string,
  albumId: string,
  options: { assetAction?: DeleteAlbumAssetAction; targetAlbumId?: string } = {},
): Promise<void> {
  const assetAction = options.assetAction ?? "keep";
  const album = await prisma.album.findFirst({ where: { id: albumId, userId } });
  if (!album) throw NotFound("Album not found");

  const childCount = await prisma.album.count({ where: { parentId: albumId } });
  if (childCount > 0) {
    throw BadRequest("Delete or move sub-albums first");
  }

  if (assetAction === "move") {
    if (!options.targetAlbumId) throw BadRequest("targetAlbumId is required to move photos");
    if (options.targetAlbumId === albumId) {
      throw BadRequest("Target album must be different from the album being deleted");
    }
    const targetAlbum = await prisma.album.findFirst({ where: { id: options.targetAlbumId, userId } });
    if (!targetAlbum) throw NotFound("Target album not found");

    // Only photos physically stored inside this album's own folder need moving -
    // photos merely linked in from elsewhere (AlbumAsset) already live somewhere
    // safe and just lose their link to this album when it's deleted below.
    const prefix = `${album.path}/`;
    const nestedAssets = await prisma.asset
      .findMany({ where: { userId, path: { startsWith: prefix } } })
      .then((rows) => rows.filter((row) => row.path.startsWith(prefix)));

    for (const asset of nestedAssets) {
      const newRelativePath = await placeFileUniquely(toAbsolutePath(asset.path), targetAlbum.path, asset.filename);
      await deleteFile(asset.path);

      // edit.service.ts's non-destructive-edit backup lives right next to
      // the asset as "<path>.original" - it isn't a DB row, so nothing above
      // moves it automatically; left behind, it both orphans disk space in
      // the now-deleted album's folder and breaks a future revert (which
      // looks for the backup at the asset's *new* path).
      const oldBackupRelative = `${asset.path}.original`;
      if (await pathExists(oldBackupRelative)) {
        await renameEntry(oldBackupRelative, `${newRelativePath}.original`);
      }

      await prisma.asset.update({
        where: { id: asset.id },
        data: { path: newRelativePath, filename: path.posix.basename(newRelativePath) },
      });
      await prisma.albumAsset.upsert({
        where: { albumId_assetId: { albumId: targetAlbum.id, assetId: asset.id } },
        update: {},
        create: { albumId: targetAlbum.id, assetId: asset.id },
      });
    }
  } else if (assetAction === "trash") {
    // "All photos in the album" means the whole grid (AlbumAsset), not just
    // ones physically stored in this folder - a photo merely linked in should
    // still end up in the trash if the user asked to trash the album's photos.
    const albumAssets = await prisma.albumAsset.findMany({
      where: { albumId, asset: { deletedAt: null } },
      select: { assetId: true },
    });
    for (const { assetId } of albumAssets) {
      await trashAsset(userId, assetId);
    }
  }

  await prisma.album.delete({ where: { id: album.id } });
  await removeEmptyDir(album.path);
}

// Album access is verified by the router (getAlbumAccess) before these are
// called. The userId here is the acting user, used only to scope asset
// ownership (you can only add assets you own to an album).
export async function addAssetsToAlbum(userId: string, albumId: string, assetIds: string[]): Promise<void> {
  const ownedAssets = await prisma.asset.findMany({
    where: { id: { in: assetIds }, userId },
    select: { id: true },
  });

  await prisma.albumAsset.createMany({
    data: ownedAssets.map((asset) => ({ albumId, assetId: asset.id })),
    skipDuplicates: true,
  });
}

export async function removeAssetFromAlbum(_userId: string, albumId: string, assetId: string): Promise<void> {
  await prisma.albumAsset.deleteMany({ where: { albumId, assetId } });
}

/**
 * Creates a new album named "Kopie von <name>" under the same parent,
 * copies all AlbumAsset links (not the files themselves), and returns the
 * new album so the client can navigate to it immediately.
 */
export async function duplicateAlbum(userId: string, albumId: string) {
  const source = await prisma.album.findFirst({ where: { id: albumId, userId } });
  if (!source) throw NotFound("Album not found");

  const copyName = `Kopie von ${source.name}`;
  const newAlbum = await createAlbum(userId, copyName, source.parentId ?? undefined);

  const sourceAssets = await prisma.albumAsset.findMany({
    where: { albumId: source.id },
    select: { assetId: true },
  });

  if (sourceAssets.length > 0) {
    await prisma.albumAsset.createMany({
      data: sourceAssets.map(({ assetId }) => ({ albumId: newAlbum.id, assetId })),
      skipDuplicates: true,
    });
  }

  return newAlbum;
}

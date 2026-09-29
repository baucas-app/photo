import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import bcrypt from "bcryptjs";
import { BadRequest, Forbidden, NotFound } from "../utils/httpError.js";
import { toAbsolutePath } from "../services/filesystem.service.js";
import {
  addAssetsToAlbum,
  createAlbum,
  deleteAlbum,
  duplicateAlbum,
  removeAssetFromAlbum,
  updateAlbum,
} from "../services/album.service.js";
import {
  sendNewCommentNotification,
  sendNewPhotosNotification,
} from "../services/email.service.js";

const APP_URL = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");

async function getAlbumMembers(albumId: string, excludeUserId?: string) {
  const [owner, members] = await Promise.all([
    prisma.album.findUnique({
      where: { id: albumId },
      select: { user: { select: { id: true, email: true, name: true } } },
    }),
    prisma.sharedMember.findMany({
      where: { albumId },
      select: { user: { select: { id: true, email: true, name: true } } },
    }),
  ]);
  const all = [
    ...(owner?.user ? [owner.user] : []),
    ...members.map((m) => m.user),
  ];
  return all.filter((u) => u.id !== excludeUserId);
}

export const albumsRouter = Router();
albumsRouter.use(requireAuth);

// Returns the album and the requesting user's role, or throws NotFound/Forbidden.
// "owner" is returned when the user owns the album; "editor"/"viewer" when they
// are an active SharedMember. Throws NotFound (not Forbidden) for unknown IDs so
// we don't leak existence to users with no relation to the album.
async function getAlbumAccess(userId: string, albumId: string) {
  const album = await prisma.album.findUnique({ where: { id: albumId } });
  if (!album) throw NotFound("Album not found");
  if (album.userId === userId) return { album, role: "owner" as const };

  const membership = await prisma.sharedMember.findUnique({
    where: { albumId_userId: { albumId, userId } },
  });
  if (!membership) throw NotFound("Album not found");

  return { album, role: membership.role as "editor" | "viewer" };
}

albumsRouter.get("/", async (req, res) => {
  const userId = req.user!.sub;
  const [ownAlbums, memberships] = await Promise.all([
    prisma.album.findMany({
      where: { userId },
      orderBy: [{ pinned: "desc" }, { name: "asc" }],
    }),
    prisma.sharedMember.findMany({
      where: { userId },
      include: { album: true },
    }),
  ]);
  // Shared albums are appended after own albums (sorted by name).
  const sharedAlbums = memberships
    .map((m) => m.album)
    .sort((a, b) => a.name.localeCompare(b.name));
  // Strip password hash from all album objects before sending to clients.
  const strip = ({ lockPasswordHash: _h, ...a }: (typeof ownAlbums)[0]) => a;
  res.json([...ownAlbums.map(strip), ...sharedAlbums.map(strip)]);
});

// The name becomes a real directory name under STORAGE_ROOT, so it must be a
// single path segment - "a/b" or "../2026/09" would otherwise let an album
// point at (and later rename/move) arbitrary folders, including shared ones.
const albumName = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((name) => !/[/\\\0]/.test(name) && name !== "." && name !== "..", {
    message: "Album name must not contain '/', '\\' or be '.' / '..'",
  });

const createSchema = z.object({
  name: albumName,
  parentId: z.string().uuid().optional(),
});

albumsRouter.post("/", async (req, res) => {
  const { name, parentId } = createSchema.parse(req.body);
  const album = await createAlbum(req.user!.sub, name, parentId);
  res.status(201).json(album);
});

const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

albumsRouter.get("/:id", async (req, res) => {
  const { album: albumBase } = await getAlbumAccess(req.user!.sub, req.params.id);
  const album = await prisma.album.findUnique({
    where: { id: albumBase.id },
    include: { children: { orderBy: { name: "asc" } } },
  });
  if (!album) throw NotFound("Album not found");

  const query = listQuerySchema.parse(req.query);

  // Map the album's sortOrder setting to a Prisma orderBy clause.
  // `id` is always the final tiebreaker to keep keyset pagination stable.
  const sortOrderMap: Record<string, object[]> = {
    takenAt_desc:    [{ asset: { takenAt: "desc" } }, { id: "desc" }],
    takenAt_asc:     [{ asset: { takenAt: "asc"  } }, { id: "asc"  }],
    uploadedAt_desc: [{ asset: { uploadedAt: "desc" } }, { id: "desc" }],
    name_asc:        [{ asset: { filename: "asc"  } }, { id: "asc"  }],
  };
  const orderBy = sortOrderMap[album.sortOrder] ?? sortOrderMap["takenAt_desc"];

  const albumAssets = await prisma.albumAsset.findMany({
    where: {
      albumId: album.id,
      // Same "stacked-away photos and a Live Photo's video component are
      // never independent grid entries" rule as GET /assets - otherwise a
      // stack shows collapsed with a badge in the main timeline but as
      // separate unbadged tiles the moment you open one of its albums.
      asset: { stackParentId: null, isLivePhotoMotion: false },
    },
    include: { asset: { include: { _count: { select: { stackChildren: true } } } } },
    orderBy,
    take: query.limit,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
  });

  // Never send the password hash to clients.
  const { lockPasswordHash: _hash, ...albumPublic } = album;
  res.json({
    ...albumPublic,
    assets: albumAssets.map(({ asset: { _count, ...asset } }) => ({ ...asset, stackCount: _count.stackChildren })),
    nextCursor: albumAssets.length === query.limit ? albumAssets.at(-1)?.id ?? null : null,
  });
});

const updateSchema = z.object({
  name: albumName.optional(),
  description: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
  coverAssetId: z.string().uuid().nullable().optional(),
  pinned: z.boolean().optional(),
  sortOrder: z.enum(["takenAt_desc", "takenAt_asc", "uploadedAt_desc", "name_asc"]).optional(),
  isLocked: z.boolean().optional(),
  // null = remove password; string = set new password
  lockPassword: z.string().min(1).nullable().optional(),
});

albumsRouter.put("/:id", async (req, res) => {
  const data = updateSchema.parse(req.body);
  const album = await updateAlbum(req.user!.sub, req.params.id, data);
  const { lockPasswordHash: _hash, ...albumPublic } = album;
  res.json(albumPublic);
});

albumsRouter.post("/:id/duplicate", async (req, res) => {
  const newAlbum = await duplicateAlbum(req.user!.sub, req.params.id);
  const { lockPasswordHash: _h, ...newAlbumPublic } = newAlbum;
  res.status(201).json(newAlbumPublic);
});

const unlockSchema = z.object({ password: z.string() });

albumsRouter.post("/:id/unlock", async (req, res) => {
  const { password } = unlockSchema.parse(req.body);
  const { album } = await getAlbumAccess(req.user!.sub, req.params.id);
  if (!album.isLocked) return res.json({ ok: true });
  if (!album.lockPasswordHash) {
    // Locked without a password means biometric-only (iOS); no web unlock possible.
    throw Forbidden("This album uses biometric lock only");
  }
  const ok = await bcrypt.compare(password, album.lockPasswordHash);
  if (!ok) throw Forbidden("Incorrect password");
  res.json({ ok: true });
});

const deleteSchema = z
  .object({
    assetAction: z.enum(["keep", "move", "trash"]).default("keep"),
    targetAlbumId: z.string().uuid().optional(),
  })
  .refine((data) => data.assetAction !== "move" || !!data.targetAlbumId, {
    message: "targetAlbumId is required when assetAction is 'move'",
    path: ["targetAlbumId"],
  });

albumsRouter.delete("/:id", async (req, res) => {
  const { assetAction, targetAlbumId } = deleteSchema.parse(req.body ?? {});
  await deleteAlbum(req.user!.sub, req.params.id, { assetAction, targetAlbumId });
  res.status(204).send();
});

const addAssetsSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1),
});

albumsRouter.post("/:id/assets", async (req, res) => {
  const { album, role } = await getAlbumAccess(req.user!.sub, req.params.id);
  if (role === "viewer") throw Forbidden("Viewers cannot add assets");
  const { assetIds } = addAssetsSchema.parse(req.body);
  await addAssetsToAlbum(req.user!.sub, req.params.id, assetIds);
  res.status(204).send();

  // Fire-and-forget email notifications to all other album members.
  if (album.userId !== req.user!.sub || (await prisma.sharedMember.count({ where: { albumId: album.id } })) > 0) {
    const adder = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { name: true } });
    getAlbumMembers(album.id, req.user!.sub).then((recipients) => {
      if (!recipients.length) return;
      sendNewPhotosNotification({
        albumName: album.name,
        albumId: album.id,
        addedCount: assetIds.length,
        addedByName: adder?.name,
        appUrl: APP_URL,
        recipients,
      });
    });
  }
});

albumsRouter.delete("/:id/assets/:assetId", async (req, res) => {
  const { role } = await getAlbumAccess(req.user!.sub, req.params.id);
  if (role === "viewer") throw Forbidden("Viewers cannot remove assets");
  await removeAssetFromAlbum(req.user!.sub, req.params.id, req.params.assetId);
  res.status(204).send();
});

// --- ZIP download -----------------------------------------------------------

const ZIP_MAX_FILES = Number(process.env.ZIP_MAX_FILES ?? 500);
const ZIP_MAX_BYTES = Number(process.env.ZIP_MAX_BYTES ?? 5 * 1024 * 1024 * 1024); // 5 GB

albumsRouter.get("/:id/download", async (req, res) => {
  const { album } = await getAlbumAccess(req.user!.sub, req.params.id);

  const albumAssets = await prisma.albumAsset.findMany({
    where: { albumId: album.id },
    include: { asset: true },
  });

  if (albumAssets.length > ZIP_MAX_FILES) {
    throw BadRequest(`Album has ${albumAssets.length} files – download is limited to ${ZIP_MAX_FILES} files at a time`);
  }

  const filePaths = albumAssets
    .map(({ asset }) => toAbsolutePath(asset.path))
    .filter((p) => existsSync(p));

  if (filePaths.length === 0) throw NotFound("Album has no downloadable assets");

  // Guard against huge albums consuming all available memory/bandwidth.
  const totalBytes = albumAssets.reduce((sum, { asset }) => sum + (asset.size ?? 0), 0);
  if (totalBytes > ZIP_MAX_BYTES) {
    throw BadRequest(`Album is too large to download at once (${Math.round(totalBytes / 1024 / 1024 / 1024)} GB). Limit is ${Math.round(ZIP_MAX_BYTES / 1024 / 1024 / 1024)} GB`);
  }

  const safeName = album.name.replace(/[^a-zA-Z0-9_\- ]/g, "_");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.zip"`);

  // -j  strips path components so all files land at ZIP root
  // -   outputs to stdout
  const child = spawn("zip", ["-j", "-", ...filePaths], { stdio: ["ignore", "pipe", "ignore"] });
  child.stdout.pipe(res);
  child.on("error", () => {
    if (!res.headersSent) res.status(500).json({ error: "ZIP creation failed – is zip installed?" });
  });
});

// --- Comments ---------------------------------------------------------------

const commentSchema = z.object({ body: z.string().trim().min(1).max(2000) });

albumsRouter.get("/:id/comments", async (req, res) => {
  await getAlbumAccess(req.user!.sub, req.params.id);
  const comments = await prisma.albumComment.findMany({
    where: { albumId: req.params.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(comments);
});

albumsRouter.post("/:id/comments", async (req, res) => {
  const { album } = await getAlbumAccess(req.user!.sub, req.params.id);
  const { body } = commentSchema.parse(req.body);
  const comment = await prisma.albumComment.create({
    data: { albumId: req.params.id, userId: req.user!.sub, body },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.status(201).json(comment);

  // Fire-and-forget notification to all other album members.
  getAlbumMembers(album.id, req.user!.sub).then((recipients) => {
    if (!recipients.length) return;
    sendNewCommentNotification({
      albumName: album.name,
      albumId: album.id,
      commentBody: body,
      commentByName: comment.user?.name ?? comment.user?.email,
      appUrl: APP_URL,
      recipients,
    });
  });
});

albumsRouter.delete("/:id/comments/:commentId", async (req, res) => {
  const comment = await prisma.albumComment.findUnique({ where: { id: req.params.commentId } });
  if (!comment || comment.albumId !== req.params.id) throw NotFound("Comment not found");
  // Only the comment author or the album owner may delete a comment.
  const { album } = await getAlbumAccess(req.user!.sub, req.params.id);
  if (comment.userId !== req.user!.sub && album.userId !== req.user!.sub) {
    throw Forbidden("Only the comment author or album owner may delete this comment");
  }
  await prisma.albumComment.delete({ where: { id: req.params.commentId } });
  res.status(204).send();
});

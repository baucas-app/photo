import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { BadRequest, NotFound } from "../utils/httpError.js";
import {
  getStackMembers,
  ingestUploadedAsset,
  permanentlyDeleteAsset,
  restoreAsset,
  stackAssets,
  trashAsset,
  unstackAsset,
} from "../services/asset.service.js";
import { editAsset, revertAsset } from "../services/edit.service.js";
import { findDuplicates } from "../services/duplicate.service.js";
import { sendRendition } from "../services/thumbnail.service.js";
import { sendAssetFile } from "../utils/sendAssetFile.js";

export const assetsRouter = Router();
assetsRouter.use(requireAuth);

const queryBoolean = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  // z.coerce.boolean() would turn the query string "false" into true.
  favorite: queryBoolean,
  archived: queryBoolean,
  trashed: queryBoolean,
  mimeType: z.string().optional(),
  cameraModel: z.string().optional(),
  tag: z.string().optional(),
});

assetsRouter.get("/", async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const wantsTrash = query.trashed ?? false;

  const assets = await prisma.asset.findMany({
    where: {
      userId: req.user!.sub,
      // Trashed items never appear in the normal timeline/album/search
      // views regardless of other filters - only the dedicated
      // ?trashed=true request (the trash screen) can see them.
      deletedAt: wantsTrash ? { not: null } : null,
      isFavorite: wantsTrash ? undefined : query.favorite,
      isArchived: wantsTrash ? undefined : (query.archived ?? false),
      mimeType: query.mimeType ? { startsWith: query.mimeType } : undefined,
      cameraModel: query.cameraModel,
      tags: query.tag ? { some: { label: query.tag } } : undefined,
      // Stacked-away photos and a Live Photo's video component are never
      // independent timeline entries - only reachable through their stack's
      // primary / their paired still (see asset.service.ts stackAssets).
      stackParentId: null,
      isLivePhotoMotion: false,
    },
    // The client needs to know a tile is a stack (and how many photos are in
    // it) without an extra request per tile - flattened onto the asset below
    // as `stackCount` (0 for a normal, unstacked asset).
    include: { _count: { select: { stackChildren: true } } },
    // `id` as the final tiebreaker: takenAt/uploadedAt/deletedAt alone aren't
    // unique (EXIF timestamps are only second-precision, a batch import can
    // share the exact same uploadedAt/deletedAt), which made cursor
    // pagination's keyset comparison ambiguous for tied rows and could
    // duplicate or skip assets across pages.
    orderBy: wantsTrash
      ? [{ deletedAt: "desc" }, { id: "desc" }]
      : [{ takenAt: "desc" }, { uploadedAt: "desc" }, { id: "desc" }],
    take: query.limit,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
  });

  res.json({
    assets: assets.map(({ _count, ...asset }) => ({ ...asset, stackCount: _count.stackChildren })),
    nextCursor: assets.length === query.limit ? assets.at(-1)?.id ?? null : null,
  });
});

// Must come before "/:id" (same reason as /memories below): lightweight
// {id, lat, lng, takenAt} points for the map view - a full asset list would
// ship every EXIF/tag field just to place a pin.
assetsRouter.get("/map", async (req, res) => {
  const points = await prisma.asset.findMany({
    where: {
      userId: req.user!.sub,
      deletedAt: null,
      stackParentId: null,
      isLivePhotoMotion: false,
      latitude: { not: null },
      longitude: { not: null },
    },
    select: { id: true, latitude: true, longitude: true, takenAt: true },
  });
  res.json({ points });
});

// Must come before "/:id" - otherwise Express would try to look up an asset
// literally named "memories".
assetsRouter.get("/memories", async (req, res) => {
  const today = new Date();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM assets
    WHERE user_id = ${req.user!.sub}
      AND deleted_at IS NULL
      AND stack_parent_id IS NULL
      AND is_live_photo_motion = false
      AND is_archived = false
      AND taken_at IS NOT NULL
      AND EXTRACT(MONTH FROM taken_at) = ${today.getMonth() + 1}
      AND EXTRACT(DAY FROM taken_at) = ${today.getDate()}
      AND EXTRACT(YEAR FROM taken_at) < ${today.getFullYear()}
  `;
  const ids = rows.map((row) => row.id);
  const assets = ids.length
    ? await prisma.asset.findMany({ where: { id: { in: ids } }, orderBy: { takenAt: "desc" } })
    : [];

  const byYear = new Map<number, typeof assets>();
  for (const asset of assets) {
    const year = asset.takenAt!.getFullYear();
    byYear.set(year, [...(byYear.get(year) ?? []), asset]);
  }
  const memories = [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, yearAssets]) => ({ year, yearsAgo: today.getFullYear() - year, assets: yearAssets }));

  res.json({ memories });
});

// Must come before "/:id" - otherwise Express would try to look up an
// asset literally named "duplicates".
assetsRouter.get("/duplicates", async (req, res) => {
  const groups = await findDuplicates(req.user!.sub);
  res.json({ groups });
});

assetsRouter.get("/:id", async (req, res) => {
  const asset = await prisma.asset.findFirst({
    where: { id: req.params.id, userId: req.user!.sub },
    include: { tags: true, faceDetections: true },
  });
  if (!asset) throw NotFound("Asset not found");
  res.json(asset);
});

assetsRouter.get("/:id/file", async (req, res) => {
  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, userId: req.user!.sub } });
  if (!asset) throw NotFound("Asset not found");
  sendAssetFile(res, asset);
});

assetsRouter.get("/:id/thumbnail", async (req, res) => {
  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, userId: req.user!.sub } });
  if (!asset) throw NotFound("Asset not found");
  await sendRendition(res, asset, "thumbnail");
});

// Browser-displayable JPEG (max 2048px) of the asset - what the web viewer
// shows for HEIC/TIFF/... originals, and the poster frame for videos.
assetsRouter.get("/:id/preview", async (req, res) => {
  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, userId: req.user!.sub } });
  if (!asset) throw NotFound("Asset not found");
  await sendRendition(res, asset, "preview");
});

assetsRouter.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) throw BadRequest("Missing file");

  const albumId = typeof req.body.albumId === "string" ? req.body.albumId : undefined;
  const isMotionComponent = req.body.isLivePhotoMotion === "true";
  const motionAssetId = typeof req.body.livePhotoVideoAssetId === "string" ? req.body.livePhotoVideoAssetId : undefined;

  // iOS passes these as form fields so the backend can use them as fallback
  // when EXIF is absent (screenshots, edited photos with stripped metadata).
  const clientTakenAt = typeof req.body.clientTakenAt === "string" ? new Date(req.body.clientTakenAt) : undefined;
  const clientLatitude = typeof req.body.clientLatitude === "string" ? parseFloat(req.body.clientLatitude) : undefined;
  const clientLongitude = typeof req.body.clientLongitude === "string" ? parseFloat(req.body.clientLongitude) : undefined;

  const asset = await ingestUploadedAsset(
    req.user!.sub,
    {
      tempPath: req.file.path,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    },
    albumId,
    { isMotionComponent, motionAssetId },
    { takenAt: clientTakenAt, latitude: clientLatitude, longitude: clientLongitude },
  );

  res.status(201).json(asset);
});

const stackSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(2),
  primaryAssetId: z.string().uuid().optional(),
});

assetsRouter.post("/stack", async (req, res) => {
  const { assetIds, primaryAssetId } = stackSchema.parse(req.body);
  await stackAssets(req.user!.sub, assetIds, primaryAssetId);
  res.status(204).send();
});

const updateSchema = z.object({
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

assetsRouter.put("/:id", async (req, res) => {
  const data = updateSchema.parse(req.body);

  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, userId: req.user!.sub } });
  if (!asset) throw NotFound("Asset not found");

  const updated = await prisma.asset.update({ where: { id: asset.id }, data });
  res.json(updated);
});

// Moves to the trash (30 days, see purgeExpiredTrash) rather than deleting
// outright - matches Apple/Immich's "Recently Deleted" safety net.
assetsRouter.delete("/:id", async (req, res) => {
  await trashAsset(req.user!.sub, req.params.id);
  res.status(204).send();
});

const editSchema = z.object({
  rotate: z.union([z.literal(90), z.literal(180), z.literal(270), z.literal(-90)]).optional(),
  crop: z
    .object({
      left: z.number().min(0),
      top: z.number().min(0),
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
  brightness: z.number().min(-100).max(100).optional(),
  contrast: z.number().min(-100).max(100).optional(),
});

assetsRouter.post("/:id/edit", async (req, res) => {
  const ops = editSchema.parse(req.body);
  const asset = await editAsset(req.user!.sub, req.params.id, ops);
  res.json(asset);
});

assetsRouter.post("/:id/revert", async (req, res) => {
  const asset = await revertAsset(req.user!.sub, req.params.id);
  res.json(asset);
});

assetsRouter.post("/:id/restore", async (req, res) => {
  await restoreAsset(req.user!.sub, req.params.id);
  res.status(204).send();
});

// The full stack (primary + members) that :id belongs to, for the "expand
// this stack" UI - works whether :id is the primary or one of the children.
assetsRouter.get("/:id/stack", async (req, res) => {
  const assets = await getStackMembers(req.user!.sub, req.params.id);
  res.json({ assets });
});

assetsRouter.delete("/:id/stack", async (req, res) => {
  await unstackAsset(req.user!.sub, req.params.id);
  res.status(204).send();
});

assetsRouter.delete("/:id/permanent", async (req, res) => {
  await permanentlyDeleteAsset(req.user!.sub, req.params.id);
  res.status(204).send();
});

// POST /assets/:id/labels  { labelId }  – assign a user-label to this asset
assetsRouter.post("/:id/labels", async (req, res) => {
  const userId = req.user!.sub;
  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, userId } });
  if (!asset) throw NotFound("Asset not found");

  const { labelId } = z.object({ labelId: z.string().uuid() }).parse(req.body);
  const label = await prisma.userLabel.findFirst({ where: { id: labelId, userId } });
  if (!label) throw NotFound("Label nicht gefunden");

  await prisma.assetLabel.upsert({
    where: { assetId_labelId: { assetId: req.params.id, labelId } },
    create: { assetId: req.params.id, labelId },
    update: {},
  });
  res.status(204).end();
});

// DELETE /assets/:id/labels/:labelId  – remove a user-label from this asset
assetsRouter.delete("/:id/labels/:labelId", async (req, res) => {
  const userId = req.user!.sub;
  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, userId } });
  if (!asset) throw NotFound("Asset not found");

  await prisma.assetLabel.deleteMany({
    where: { assetId: req.params.id, labelId: req.params.labelId },
  });
  res.status(204).end();
});

// GET /assets/:id/labels  – labels assigned to this asset
assetsRouter.get("/:id/labels", async (req, res) => {
  const userId = req.user!.sub;
  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, userId } });
  if (!asset) throw NotFound("Asset not found");

  const labels = await prisma.assetLabel.findMany({
    where: { assetId: req.params.id },
    include: { label: true },
    orderBy: { label: { name: "asc" } },
  });
  res.json(labels.map((al) => al.label));
});

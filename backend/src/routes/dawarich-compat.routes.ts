/**
 * Dawarich integration layer.
 *
 * Dawarich supports configuring a photo source to show photos next to GPS
 * routes. This router implements the small API subset Dawarich expects so
 * Photos can be configured as that photo source directly.
 *
 * Configured in Dawarich:
 *   Settings → Integrations → Photo services
 *   URL:     http://<photos-host>:3001/compat   (note the /compat prefix)
 *   API key: any Photos API key
 *
 * Mounted at /compat/api in app.ts to avoid colliding with Photos' own
 * /api/assets/* routes.
 *
 * Endpoints implemented (relative to /compat):
 *   GET /api/server-info             – version handshake
 *   GET /api/assets                  – assets in a date range (takenAfter / takenBefore)
 *   GET /api/assets/:id/thumbnail    – JPEG thumbnail redirect
 *   GET /api/assets/:id              – single asset detail
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../db/prisma.js";
import { BadRequest, NotFound } from "../utils/httpError.js";

const assetsQuerySchema = z.object({
  takenAfter:  z.string().datetime({ offset: true }).optional(),
  takenBefore: z.string().datetime({ offset: true }).optional(),
  page:        z.coerce.number().int().min(1).default(1),
  pageSize:    z.coerce.number().int().min(1).max(1000).default(200),
});

export const dawarichCompatRouter = Router();

dawarichCompatRouter.use(requireAuth);

// ── Server info ─────────────────────────────────────────────────────────────

dawarichCompatRouter.get("/server-info", (_req, res) => {
  res.json({
    version: "1.117.0",
    versionUrl: "",
    licensed: false,
    releaseVersion: "1.117.0",
  });
});

// ── Asset list ──────────────────────────────────────────────────────────────

dawarichCompatRouter.get("/assets", async (req, res) => {
  const parsed = assetsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw BadRequest(parsed.error.issues[0]?.message ?? "Invalid query");
  const { takenAfter, takenBefore, page, pageSize } = parsed.data;

  const assets = await prisma.asset.findMany({
    where: {
      userId: req.user!.sub,
      deletedAt: null,
      isLivePhotoMotion: false,
      ...(takenAfter || takenBefore
        ? {
            takenAt: {
              ...(takenAfter ? { gte: new Date(takenAfter) } : {}),
              ...(takenBefore ? { lte: new Date(takenBefore) } : {}),
            },
          }
        : {}),
    },
    select: {
      id: true, filename: true, mimeType: true, takenAt: true,
      uploadedAt: true, latitude: true, longitude: true,
      width: true, height: true, cameraMake: true, cameraModel: true,
      isFavorite: true, isArchived: true,
    },
    orderBy: { takenAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  res.json(assets.map(toAsset));
});

// ── Single asset ─────────────────────────────────────────────────────────────

dawarichCompatRouter.get("/assets/:id", async (req, res) => {
  const asset = await prisma.asset.findFirst({
    where: { id: req.params.id, userId: req.user!.sub, deletedAt: null },
  });
  if (!asset) throw NotFound("Asset not found");
  res.json(toAsset(asset));
});

// ── Thumbnail ────────────────────────────────────────────────────────────────

dawarichCompatRouter.get("/assets/:id/thumbnail", async (req, res) => {
  const asset = await prisma.asset.findFirst({
    where: { id: req.params.id, userId: req.user!.sub, deletedAt: null },
    select: { id: true },
  });
  if (!asset) throw NotFound("Asset not found");
  res.redirect(302, `/api/assets/${req.params.id}/thumbnail`);
});

// ── Helper ───────────────────────────────────────────────────────────────────

function toAsset(a: {
  id: string;
  filename: string;
  mimeType: string | null;
  takenAt: Date | null;
  uploadedAt: Date;
  latitude: number | null;
  longitude: number | null;
  width?: number | null;
  height?: number | null;
  cameraMake?: string | null;
  cameraModel?: string | null;
  isFavorite?: boolean;
  isArchived?: boolean;
}) {
  const isVideo = a.mimeType?.startsWith("video/") ?? false;
  return {
    id: a.id,
    deviceAssetId: a.id,
    deviceId: "photos-app",
    ownerId: "n/a",
    fileCreatedAt: (a.takenAt ?? a.uploadedAt).toISOString(),
    fileModifiedAt: a.uploadedAt.toISOString(),
    localDateTime: (a.takenAt ?? a.uploadedAt).toISOString(),
    updatedAt: a.uploadedAt.toISOString(),
    originalPath: a.filename,
    originalFileName: a.filename,
    thumbhash: null,
    type: isVideo ? "VIDEO" : "IMAGE",
    isFavorite: a.isFavorite ?? false,
    isArchived: a.isArchived ?? false,
    isOffline: false,
    livePhotoVideoId: null,
    checksum: a.id,
    exifInfo: {
      latitude: a.latitude ?? null,
      longitude: a.longitude ?? null,
      make: a.cameraMake ?? null,
      model: a.cameraModel ?? null,
      exifImageWidth: a.width ?? null,
      exifImageHeight: a.height ?? null,
      dateTimeOriginal: a.takenAt?.toISOString() ?? null,
    },
  };
}

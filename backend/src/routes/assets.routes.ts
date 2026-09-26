import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { BadRequest, NotFound } from "../utils/httpError.js";
import { deleteAsset, ingestUploadedAsset } from "../services/asset.service.js";
import { toAbsolutePath } from "../services/filesystem.service.js";
import { getOrCreateThumbnail } from "../services/thumbnail.service.js";

export const assetsRouter = Router();
assetsRouter.use(requireAuth);

const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  favorite: z.coerce.boolean().optional(),
  archived: z.coerce.boolean().optional(),
  mimeType: z.string().optional(),
  cameraModel: z.string().optional(),
});

assetsRouter.get("/", async (req, res) => {
  const query = listQuerySchema.parse(req.query);

  const assets = await prisma.asset.findMany({
    where: {
      userId: req.user!.sub,
      isFavorite: query.favorite,
      isArchived: query.archived ?? false,
      mimeType: query.mimeType ? { startsWith: query.mimeType } : undefined,
      cameraModel: query.cameraModel,
    },
    orderBy: [{ takenAt: "desc" }, { uploadedAt: "desc" }],
    take: query.limit,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
  });

  res.json({
    assets,
    nextCursor: assets.length === query.limit ? assets.at(-1)?.id ?? null : null,
  });
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
  res.sendFile(toAbsolutePath(asset.path), {
    headers: { "Content-Type": asset.mimeType ?? "application/octet-stream" },
  });
});

assetsRouter.get("/:id/thumbnail", async (req, res) => {
  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, userId: req.user!.sub } });
  if (!asset) throw NotFound("Asset not found");
  const thumbPath = await getOrCreateThumbnail(asset.id, asset.path);
  res.sendFile(thumbPath, { headers: { "Content-Type": "image/webp" } });
});

assetsRouter.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) throw BadRequest("Missing file");

  const albumId = typeof req.body.albumId === "string" ? req.body.albumId : undefined;

  const asset = await ingestUploadedAsset(
    req.user!.sub,
    {
      tempPath: req.file.path,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    },
    albumId,
  );

  res.status(201).json(asset);
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

assetsRouter.delete("/:id", async (req, res) => {
  await deleteAsset(req.user!.sub, req.params.id);
  res.status(204).send();
});

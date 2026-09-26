import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { NotFound } from "../utils/httpError.js";
import {
  addAssetsToAlbum,
  createAlbum,
  deleteAlbum,
  removeAssetFromAlbum,
  updateAlbum,
} from "../services/album.service.js";

export const albumsRouter = Router();
albumsRouter.use(requireAuth);

albumsRouter.get("/", async (req, res) => {
  const albums = await prisma.album.findMany({
    where: { userId: req.user!.sub },
    orderBy: { path: "asc" },
  });
  res.json(albums);
});

const createSchema = z.object({
  name: z.string().min(1),
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
  const album = await prisma.album.findFirst({
    where: { id: req.params.id, userId: req.user!.sub },
    include: { children: { orderBy: { name: "asc" } } },
  });
  if (!album) throw NotFound("Album not found");

  const query = listQuerySchema.parse(req.query);
  const albumAssets = await prisma.albumAsset.findMany({
    where: { albumId: album.id },
    include: { asset: true },
    orderBy: { asset: { takenAt: "desc" } },
    take: query.limit,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
  });

  res.json({
    ...album,
    assets: albumAssets.map((entry) => entry.asset),
    nextCursor: albumAssets.length === query.limit ? albumAssets.at(-1)?.id ?? null : null,
  });
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

albumsRouter.put("/:id", async (req, res) => {
  const data = updateSchema.parse(req.body);
  const album = await updateAlbum(req.user!.sub, req.params.id, data);
  res.json(album);
});

albumsRouter.delete("/:id", async (req, res) => {
  await deleteAlbum(req.user!.sub, req.params.id);
  res.status(204).send();
});

const addAssetsSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1),
});

albumsRouter.post("/:id/assets", async (req, res) => {
  const { assetIds } = addAssetsSchema.parse(req.body);
  await addAssetsToAlbum(req.user!.sub, req.params.id, assetIds);
  res.status(204).send();
});

albumsRouter.delete("/:id/assets/:assetId", async (req, res) => {
  await removeAssetFromAlbum(req.user!.sub, req.params.id, req.params.assetId);
  res.status(204).send();
});

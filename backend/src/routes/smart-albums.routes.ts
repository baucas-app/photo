import { Router } from "express";
import { z } from "zod";
import { Prisma, prisma } from "@photos/database";
import { requireAuth } from "../middleware/auth.js";
import { BadRequest, NotFound } from "../utils/httpError.js";

export const smartAlbumsRouter = Router();
smartAlbumsRouter.use(requireAuth);

// A single rule – field + operator + value
const ruleSchema = z.object({
  field: z.enum([
    "tag",
    "cameraModel",
    "cameraMake",
    "takenAfter",
    "takenBefore",
    "isFavorite",
    "locationCity",
    "locationCountry",
    "ocrContains",
  ]),
  op: z.enum(["eq", "contains", "before", "after", "is"]),
  value: z.string(),
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  rules: z.array(ruleSchema).min(1),
});

function buildAssetWhere(
  userId: string,
  rules: z.infer<typeof ruleSchema>[]
): Prisma.AssetWhereInput {
  const base: Prisma.AssetWhereInput = {
    userId,
    deletedAt: null,
    isArchived: false,
    isLivePhotoMotion: false,
    stackParentId: null,
  };
  const extra: Prisma.AssetWhereInput[] = rules.map((r) => {
    switch (r.field) {
      case "tag":
        return { tags: { some: { label: { equals: r.value, mode: "insensitive" } } } };
      case "cameraModel":
        return { cameraModel: { contains: r.value, mode: "insensitive" } };
      case "cameraMake":
        return { cameraMake: { contains: r.value, mode: "insensitive" } };
      case "takenAfter":
        return { takenAt: { gte: new Date(r.value) } };
      case "takenBefore":
        return { takenAt: { lte: new Date(r.value) } };
      case "isFavorite":
        return { isFavorite: r.value === "true" };
      case "locationCity":
        return { locationCity: { contains: r.value, mode: "insensitive" } };
      case "locationCountry":
        return { locationCountry: { contains: r.value, mode: "insensitive" } };
      case "ocrContains":
        return { ocrText: { contains: r.value, mode: "insensitive" } };
      default:
        return {};
    }
  });
  return { AND: [base, ...extra] };
}

// GET /smart-albums
smartAlbumsRouter.get("/", async (req, res) => {
  const albums = await prisma.smartAlbum.findMany({
    where: { userId: req.user!.sub },
    orderBy: { createdAt: "asc" },
  });
  res.json(albums);
});

// POST /smart-albums
smartAlbumsRouter.post("/", async (req, res) => {
  const { name, rules } = createSchema.parse(req.body);
  const album = await prisma.smartAlbum.create({
    data: { id: crypto.randomUUID(), userId: req.user!.sub, name, rules },
  });
  res.status(201).json(album);
});

// GET /smart-albums/:id
smartAlbumsRouter.get("/:id", async (req, res) => {
  const album = await prisma.smartAlbum.findFirst({
    where: { id: req.params.id, userId: req.user!.sub },
  });
  if (!album) throw NotFound("Smart Album nicht gefunden");
  res.json(album);
});

// PATCH /smart-albums/:id
smartAlbumsRouter.patch("/:id", async (req, res) => {
  const album = await prisma.smartAlbum.findFirst({
    where: { id: req.params.id, userId: req.user!.sub },
  });
  if (!album) throw NotFound("Smart Album nicht gefunden");
  const partial = z
    .object({
      name: z.string().min(1).max(255).optional(),
      rules: z.array(ruleSchema).min(1).optional(),
    })
    .parse(req.body);
  const updated = await prisma.smartAlbum.update({
    where: { id: req.params.id },
    data: { ...partial, updatedAt: new Date() },
  });
  res.json(updated);
});

// DELETE /smart-albums/:id
smartAlbumsRouter.delete("/:id", async (req, res) => {
  const album = await prisma.smartAlbum.findFirst({
    where: { id: req.params.id, userId: req.user!.sub },
  });
  if (!album) throw NotFound("Smart Album nicht gefunden");
  await prisma.smartAlbum.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// GET /smart-albums/:id/assets  – evaluate rules and return matching assets
smartAlbumsRouter.get("/:id/assets", async (req, res) => {
  const album = await prisma.smartAlbum.findFirst({
    where: { id: req.params.id, userId: req.user!.sub },
  });
  if (!album) throw NotFound("Smart Album nicht gefunden");
  const rules = z.array(ruleSchema).parse(album.rules);
  const limit = Math.min(Number(req.query.limit ?? 200), 500);
  const cursor = req.query.cursor as string | undefined;

  const where = buildAssetWhere(req.user!.sub, rules);
  const assets = await prisma.asset.findMany({
    where,
    orderBy: { takenAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = assets.length > limit;
  res.json({
    assets: assets.slice(0, limit),
    nextCursor: hasMore ? assets[limit - 1]!.id : null,
  });
});

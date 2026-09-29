import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { NotFound } from "../utils/httpError.js";

export const facesRouter = Router();
facesRouter.use(requireAuth);

facesRouter.get("/", async (req, res) => {
  const faces = await prisma.face.findMany({
    where: { userId: req.user!.sub },
    include: {
      sampleAsset: true,
      _count: { select: { faceDetections: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  res.json(
    faces.map((face) => ({
      id: face.id,
      personName: face.personName,
      sampleAsset: face.sampleAsset,
      assetCount: face._count.faceDetections,
    })),
  );
});

const renameSchema = z.object({
  personName: z.string().min(1).max(120),
});

facesRouter.put("/:faceId", async (req, res) => {
  const { personName } = renameSchema.parse(req.body);

  const face = await prisma.face.findFirst({ where: { id: req.params.faceId, userId: req.user!.sub } });
  if (!face) throw NotFound("Face not found");

  const updated = await prisma.face.update({ where: { id: face.id }, data: { personName } });
  res.json(updated);
});

const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

facesRouter.get("/:faceId/assets", async (req, res) => {
  const face = await prisma.face.findFirst({ where: { id: req.params.faceId, userId: req.user!.sub } });
  if (!face) throw NotFound("Face not found");

  const query = listQuerySchema.parse(req.query);
  // Was previously a FaceDetection query with `distinct: ["assetId"]` (one
  // person can be detected more than once in the same photo) - Postgres'
  // DISTINCT ON requires the ORDER BY to start with the distinct columns,
  // which doesn't compose reliably with Prisma's cursor/skip pagination and
  // could duplicate or skip assets across pages. Querying Asset directly via
  // the relation filter sidesteps that entirely: each matching asset can
  // only appear once, no `distinct` needed.
  const assets = await prisma.asset.findMany({
    where: {
      userId: req.user!.sub,
      deletedAt: null,
      stackParentId: null,
      isLivePhotoMotion: false,
      faceDetections: { some: { faceId: face.id } },
    },
    orderBy: [{ takenAt: "desc" }, { id: "desc" }],
    take: query.limit,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
  });

  res.json({
    assets,
    nextCursor: assets.length === query.limit ? assets.at(-1)?.id ?? null : null,
  });
});

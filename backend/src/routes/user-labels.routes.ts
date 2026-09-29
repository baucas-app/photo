import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { BadRequest, NotFound } from "../utils/httpError.js";

export const userLabelsRouter = Router();
userLabelsRouter.use(requireAuth);

// GET /user-labels – full label tree for this user
userLabelsRouter.get("/", async (req, res) => {
  const labels = await prisma.userLabel.findMany({
    where: { userId: req.user!.sub },
    include: { _count: { select: { assetLabels: true } } },
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
  });
  res.json(labels.map(({ _count, ...l }) => ({ ...l, assetCount: _count.assetLabels })));
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
});

// POST /user-labels
userLabelsRouter.post("/", async (req, res) => {
  const { name, color, parentId } = createSchema.parse(req.body);
  const userId = req.user!.sub;

  if (parentId) {
    const parent = await prisma.userLabel.findFirst({ where: { id: parentId, userId } });
    if (!parent) throw NotFound("Parent-Label nicht gefunden");
  }

  const label = await prisma.userLabel.create({
    data: { id: crypto.randomUUID(), userId, name, color: color ?? null, parentId: parentId ?? null },
  });
  res.status(201).json(label);
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
});

// PATCH /user-labels/:id
userLabelsRouter.patch("/:id", async (req, res) => {
  const userId = req.user!.sub;
  const label = await prisma.userLabel.findFirst({ where: { id: req.params.id, userId } });
  if (!label) throw NotFound("Label nicht gefunden");

  const data = updateSchema.parse(req.body);

  if (data.parentId != null) {
    if (data.parentId === req.params.id) throw BadRequest("Ein Label kann nicht sein eigenes Eltern-Label sein");
    const parent = await prisma.userLabel.findFirst({ where: { id: data.parentId, userId } });
    if (!parent) throw NotFound("Parent-Label nicht gefunden");
  }

  const updated = await prisma.userLabel.update({
    where: { id: req.params.id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.color !== undefined && { color: data.color }),
      ...("parentId" in data && { parentId: data.parentId }),
    },
  });
  res.json(updated);
});

// DELETE /user-labels/:id  – children's parentId becomes null (SET NULL)
userLabelsRouter.delete("/:id", async (req, res) => {
  const userId = req.user!.sub;
  const label = await prisma.userLabel.findFirst({ where: { id: req.params.id, userId } });
  if (!label) throw NotFound("Label nicht gefunden");
  await prisma.userLabel.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// GET /user-labels/:id/assets – assets tagged with this label (incl. cursor pagination)
userLabelsRouter.get("/:id/assets", async (req, res) => {
  const userId = req.user!.sub;
  const label = await prisma.userLabel.findFirst({ where: { id: req.params.id, userId } });
  if (!label) throw NotFound("Label nicht gefunden");

  // Collect this label + all descendants (recursive)
  const allIds = await collectDescendants(req.params.id, userId);

  const limit = Math.min(Number(req.query.limit ?? 60), 200);
  const cursor = req.query.cursor as string | undefined;

  const assets = await prisma.asset.findMany({
    where: {
      userId,
      deletedAt: null,
      isArchived: false,
      isLivePhotoMotion: false,
      stackParentId: null,
      assetLabels: { some: { labelId: { in: allIds } } },
    },
    orderBy: [{ takenAt: "desc" }, { uploadedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = assets.length > limit;
  res.json({ assets: assets.slice(0, limit), nextCursor: hasMore ? assets[limit - 1]!.id : null });
});

async function collectDescendants(labelId: string, userId: string): Promise<string[]> {
  const all = [labelId];
  const children = await prisma.userLabel.findMany({ where: { parentId: labelId, userId }, select: { id: true } });
  for (const child of children) {
    all.push(...(await collectDescendants(child.id, userId)));
  }
  return all;
}

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@photos/database";
import { requireAuth } from "../middleware/auth.js";
import { NotFound } from "../utils/httpError.js";

export const tagGroupsRouter = Router();
tagGroupsRouter.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  labels: z.array(z.string().min(1)).min(1),
});

// GET /tag-groups
tagGroupsRouter.get("/", async (req, res) => {
  const groups = await prisma.tagGroup.findMany({
    where: { userId: req.user!.sub },
    include: { labels: true },
    orderBy: { name: "asc" },
  });
  res.json(groups);
});

// POST /tag-groups
tagGroupsRouter.post("/", async (req, res) => {
  const { name, labels } = createSchema.parse(req.body);
  const group = await prisma.tagGroup.create({
    data: {
      id: crypto.randomUUID(),
      userId: req.user!.sub,
      name,
      labels: {
        create: labels.map((label) => ({ id: crypto.randomUUID(), label })),
      },
    },
    include: { labels: true },
  });
  res.status(201).json(group);
});

// GET /tag-groups/:id
tagGroupsRouter.get("/:id", async (req, res) => {
  const group = await prisma.tagGroup.findFirst({
    where: { id: req.params.id, userId: req.user!.sub },
    include: { labels: true },
  });
  if (!group) throw NotFound("Tag-Gruppe nicht gefunden");
  res.json(group);
});

// PATCH /tag-groups/:id  – name and/or full label replacement
tagGroupsRouter.patch("/:id", async (req, res) => {
  const group = await prisma.tagGroup.findFirst({
    where: { id: req.params.id, userId: req.user!.sub },
  });
  if (!group) throw NotFound("Tag-Gruppe nicht gefunden");

  const partial = z
    .object({
      name: z.string().min(1).max(100).optional(),
      labels: z.array(z.string().min(1)).min(1).optional(),
    })
    .parse(req.body);

  await prisma.$transaction(async (tx) => {
    if (partial.name) {
      await tx.tagGroup.update({ where: { id: req.params.id }, data: { name: partial.name } });
    }
    if (partial.labels) {
      await tx.tagGroupLabel.deleteMany({ where: { tagGroupId: req.params.id } });
      await tx.tagGroupLabel.createMany({
        data: partial.labels.map((label) => ({
          id: crypto.randomUUID(),
          tagGroupId: req.params.id,
          label,
        })),
      });
    }
  });

  const updated = await prisma.tagGroup.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { labels: true },
  });
  res.json(updated);
});

// DELETE /tag-groups/:id
tagGroupsRouter.delete("/:id", async (req, res) => {
  const group = await prisma.tagGroup.findFirst({
    where: { id: req.params.id, userId: req.user!.sub },
  });
  if (!group) throw NotFound("Tag-Gruppe nicht gefunden");
  await prisma.tagGroup.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// GET /tag-groups/:id/assets – all assets that have at least one label from this group
tagGroupsRouter.get("/:id/assets", async (req, res) => {
  const group = await prisma.tagGroup.findFirst({
    where: { id: req.params.id, userId: req.user!.sub },
    include: { labels: true },
  });
  if (!group) throw NotFound("Tag-Gruppe nicht gefunden");
  const labelStrings = group.labels.map((l) => l.label);
  const limit = Math.min(Number(req.query.limit ?? 200), 500);
  const cursor = req.query.cursor as string | undefined;

  const assets = await prisma.asset.findMany({
    where: {
      userId: req.user!.sub,
      deletedAt: null,
      isArchived: false,
      isLivePhotoMotion: false,
      stackParentId: null,
      tags: { some: { label: { in: labelStrings } } },
    },
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

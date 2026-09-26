import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { BadRequest, Conflict, NotFound } from "../utils/httpError.js";
import { getGitStatus, pullAndRestart } from "../services/git.service.js";
import { enqueueMlPipeline, mlQueue } from "../queues/mlQueue.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/stats", async (_req, res) => {
  const [userCount, assetCount, storage] = await Promise.all([
    prisma.user.count(),
    prisma.asset.count(),
    prisma.asset.aggregate({ _sum: { size: true } }),
  ]);

  res.json({
    userCount,
    assetCount,
    storageBytes: storage._sum.size ?? 0,
  });
});

adminRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(users);
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
  role: z.enum(["user", "admin"]).default("user"),
});

adminRouter.post("/users", async (req, res) => {
  const data = createUserSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw Conflict("Email already registered");

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: { email: data.email, passwordHash, name: data.name, role: data.role },
  });

  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

adminRouter.delete("/users/:userId", async (req, res) => {
  if (req.params.userId === req.user!.sub) {
    throw BadRequest("You cannot delete your own account");
  }

  const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!user) throw NotFound("User not found");

  await prisma.user.delete({ where: { id: user.id } });
  res.status(204).send();
});

adminRouter.post("/ml/rescan", async (_req, res) => {
  const assets = await prisma.asset.findMany({ select: { id: true, userId: true, path: true } });

  await Promise.all(
    assets.map((asset) =>
      enqueueMlPipeline({ assetId: asset.id, userId: asset.userId, relativePath: asset.path }),
    ),
  );

  res.status(202).json({ queued: assets.length });
});

adminRouter.get("/ml/status", async (_req, res) => {
  const counts = await mlQueue.getJobCounts("active", "waiting", "completed", "failed", "delayed");
  res.json(counts);
});

adminRouter.get("/git-status", async (_req, res) => {
  res.json(await getGitStatus());
});

adminRouter.post("/git-update", async (_req, res) => {
  const result = await pullAndRestart();
  res.status(result.success ? 200 : 500).json(result);
});

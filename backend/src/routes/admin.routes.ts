import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { execFile } from "child_process";
import { prisma } from "../db/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { BadRequest, Conflict, NotFound } from "../utils/httpError.js";
import { getGitStatus, pullAndRestart } from "../services/git.service.js";
import { enqueueMlPipeline, mlQueue } from "../queues/mlQueue.js";
import { backupStream, deleteBackup, listBackups, runBackup } from "../services/backup.service.js";
import { env } from "../config/env.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/stats", async (_req, res) => {
  const [userCount, assetCount, storage] = await Promise.all([
    prisma.user.count(),
    prisma.asset.count({ where: { deletedAt: null } }),
    prisma.asset.aggregate({ where: { deletedAt: null }, _sum: { size: true } }),
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

  // shared_links.created_by is ON DELETE RESTRICT in the schema, so any user
  // who ever created a share link could not be deleted at all (500). Remove
  // those links explicitly in the same transaction as the user.
  await prisma.$transaction([
    prisma.sharedLink.deleteMany({ where: { createdBy: user.id } }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);
  res.status(204).send();
});

adminRouter.post("/ml/rescan", async (_req, res) => {
  const assets = await prisma.asset.findMany({
    where: { deletedAt: null },
    select: { id: true, userId: true, path: true },
  });

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

// ── Database backups ─────────────────────────────────────────────────────────

adminRouter.get("/backups", (_req, res) => {
  res.json(listBackups());
});

adminRouter.post("/backups", async (_req, res) => {
  const filename = await runBackup();
  res.status(201).json({ filename });
});

adminRouter.get("/backups/:filename", (req, res) => {
  const stream = backupStream(req.params.filename);
  if (!stream) throw NotFound("Backup not found");
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Disposition", `attachment; filename="${req.params.filename}"`);
  stream.pipe(res);
});

adminRouter.delete("/backups/:filename", (req, res) => {
  const ok = deleteBackup(req.params.filename);
  if (!ok) throw NotFound("Backup not found");
  res.status(204).send();
});

// ── Storage ──────────────────────────────────────────────────────────────────

adminRouter.get("/storage", (_req, res) => {
  const storageRoot = env.storageRoot;
  execFile("df", ["-k", storageRoot], (_err, stdout) => {
    let used: number | null = null;
    let total: number | null = null;
    if (stdout) {
      const lines = stdout.trim().split("\n");
      if (lines.length >= 2 && lines[1] !== undefined) {
        const parts = lines[1].split(/\s+/);
        // df -k columns: Filesystem 1K-blocks Used Available Use% Mounted
        if (parts.length >= 3 && parts[1] !== undefined && parts[2] !== undefined) {
          total = parseInt(parts[1], 10) * 1024;
          used = parseInt(parts[2], 10) * 1024;
        }
      }
    }
    res.json({ storageRoot, diskUsed: used, diskTotal: total });
  });
});

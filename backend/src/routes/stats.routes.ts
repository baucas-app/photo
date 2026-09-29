import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const statsRouter = Router();
statsRouter.use(requireAuth);

/**
 * Camera/device breakdown for the current user's library, e.g. "142 photos
 * shot on iPhone 12 Pro, 38 on iPhone 15" - surfaced as a search facet on
 * the frontend/iOS search screen.
 */
statsRouter.get("/cameras", async (req, res) => {
  const grouped = await prisma.asset.groupBy({
    by: ["cameraMake", "cameraModel"],
    where: { userId: req.user!.sub, cameraModel: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { cameraModel: "desc" } },
  });

  res.json(
    grouped.map((entry) => ({
      cameraMake: entry.cameraMake,
      cameraModel: entry.cameraModel,
      count: entry._count._all,
    })),
  );
});

statsRouter.get("/overview", async (req, res) => {
  const userId = req.user!.sub;
  const [totalAssets, favorites, videos, byYear] = await Promise.all([
    prisma.asset.count({ where: { userId, deletedAt: null, stackParentId: null, isLivePhotoMotion: false } }),
    prisma.asset.count({
      where: { userId, isFavorite: true, deletedAt: null, stackParentId: null, isLivePhotoMotion: false },
    }),
    // A Live Photo's video component must not inflate the video count - the
    // user never sees it as a standalone video, only through its still photo.
    prisma.asset.count({
      where: { userId, mimeType: { startsWith: "video/" }, deletedAt: null, isLivePhotoMotion: false },
    }),
    prisma.$queryRaw<{ year: number; count: bigint }[]>`
      SELECT EXTRACT(YEAR FROM "taken_at")::int AS year, COUNT(*)::bigint AS count
      FROM "assets"
      WHERE "user_id" = ${userId} AND "taken_at" IS NOT NULL AND "deleted_at" IS NULL
      GROUP BY year
      ORDER BY year DESC
    `,
  ]);

  res.json({
    totalAssets,
    favorites,
    videos,
    byYear: byYear.map((row) => ({ year: row.year, count: Number(row.count) })),
  });
});

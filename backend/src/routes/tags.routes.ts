import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const tagsRouter = Router();
tagsRouter.use(requireAuth);

tagsRouter.get("/", async (req, res) => {
  const tags = await prisma.tag.groupBy({
    by: ["label"],
    where: { asset: { userId: req.user!.sub } },
    _count: { label: true },
    orderBy: { _count: { label: "desc" } },
  });

  res.json(tags.map((tag) => ({ label: tag.label, count: tag._count.label })));
});

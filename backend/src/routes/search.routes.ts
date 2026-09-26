import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { semanticSearch } from "../services/search.service.js";

export const searchRouter = Router();
searchRouter.use(requireAuth);

const querySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

searchRouter.get("/", async (req, res) => {
  const { q, limit } = querySchema.parse(req.query);
  const results = await semanticSearch(req.user!.sub, q, limit);
  res.json({
    results: results.map(({ asset, score }) => ({ asset, score })),
  });
});

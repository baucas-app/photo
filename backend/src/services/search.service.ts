import { bufferToFloats, cosineSimilarity, getClipTextEmbedding } from "@photos/shared";
import { prisma } from "../db/prisma.js";

/**
 * Brute-force cosine similarity over every embedding the user owns. Fine for
 * a personal library (thousands of photos); if this ever needs to scale to
 * shared multi-tenant libraries, move the vectors into pgvector and let
 * Postgres do the nearest-neighbour search instead.
 */
export async function semanticSearch(userId: string, query: string, limit = 60) {
  const { embedding: queryVector } = await getClipTextEmbedding(query);

  const embeddings = await prisma.assetEmbedding.findMany({
    where: { asset: { userId } },
    include: { asset: true },
  });

  const scored = embeddings
    .map((entry) => ({
      asset: entry.asset,
      score: cosineSimilarity(queryVector, bufferToFloats(entry.vector)),
    }))
    .filter((entry) => !entry.asset.isArchived)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

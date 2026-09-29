import { bufferToFloats, cosineSimilarity, getClipTextEmbedding } from "@photos/shared";
import { prisma } from "../db/prisma.js";

/**
 * Combined search: semantic CLIP similarity + OCR full-text match.
 * OCR results are merged in with a fixed score of 0.7 so they rank below
 * strong semantic matches but above weak ones (typical CLIP threshold ~0.2).
 * Brute-force is fine for a personal library; move to pgvector if it grows.
 */
export async function semanticSearch(userId: string, query: string, limit = 60) {
  const baseFilter = { userId, deletedAt: null, stackParentId: null, isLivePhotoMotion: false, isArchived: false };

  const [embeddings, ocrMatches] = await Promise.all([
    prisma.assetEmbedding.findMany({
      where: { asset: baseFilter },
      include: { asset: true },
    }),
    prisma.asset.findMany({
      where: { ...baseFilter, ocrText: { contains: query, mode: "insensitive" } },
    }),
  ]);

  const { embedding: queryVector } = await getClipTextEmbedding(query);

  const seenIds = new Set<string>();
  const results: { asset: (typeof embeddings)[0]["asset"]; score: number }[] = [];

  // Semantic results first (sorted by score)
  for (const entry of embeddings
    .map((e) => ({ asset: e.asset, score: cosineSimilarity(queryVector, bufferToFloats(e.vector)) }))
    .sort((a, b) => b.score - a.score)) {
    seenIds.add(entry.asset.id);
    results.push(entry);
  }

  // OCR results: insert with score 0.7 (above weak semantic, below strong semantic)
  for (const asset of ocrMatches) {
    if (!seenIds.has(asset.id)) {
      results.push({ asset, score: 0.7 });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

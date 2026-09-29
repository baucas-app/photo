import { prisma } from "../db/prisma.js";
import { hammingDistance } from "./hash.service.js";

// Two aHashes within this many differing bits (out of 64) are treated as the
// same photo re-encoded/resized, not two different photos that merely look similar.
const DUPLICATE_THRESHOLD = 6;

export interface DuplicateGroup {
  hash: string;
  assets: {
    id: string;
    filename: string;
    path: string;
    size: number | null;
    takenAt: Date | null;
    uploadedAt: Date;
  }[];
}

/**
 * Brute-force pairwise comparison, same tradeoff as semantic search: fine
 * for a personal library, would need an index (e.g. a BK-tree) to scale to
 * a shared library with hundreds of thousands of assets.
 */
export async function findDuplicates(userId: string): Promise<DuplicateGroup[]> {
  const assets = await prisma.asset.findMany({
    where: { userId, hash: { not: null }, isArchived: false, deletedAt: null, stackParentId: null, isLivePhotoMotion: false },
    select: { id: true, filename: true, path: true, size: true, takenAt: true, uploadedAt: true, hash: true },
    orderBy: { uploadedAt: "asc" },
  });

  const visited = new Set<string>();
  const groups: DuplicateGroup[] = [];

  for (let i = 0; i < assets.length; i++) {
    const a = assets[i]!;
    if (visited.has(a.id) || !a.hash) continue;

    const cluster = [a];
    for (let j = i + 1; j < assets.length; j++) {
      const b = assets[j]!;
      if (visited.has(b.id) || !b.hash) continue;
      if (hammingDistance(a.hash, b.hash) <= DUPLICATE_THRESHOLD) {
        cluster.push(b);
        visited.add(b.id);
      }
    }

    if (cluster.length > 1) {
      visited.add(a.id);
      groups.push({
        hash: a.hash,
        assets: cluster.map(({ id, filename, path, size, takenAt, uploadedAt }) => ({
          id,
          filename,
          path,
          size,
          takenAt,
          uploadedAt,
        })),
      });
    }
  }

  return groups;
}

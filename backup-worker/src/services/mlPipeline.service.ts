import { prisma } from "@photos/database";
import {
  bufferToFloats,
  cosineSimilarity,
  detectFaces,
  detectObjects,
  floatsToBuffer,
  getClipEmbedding,
} from "@photos/shared";

// Faces within this cosine distance of an existing cluster are treated as the
// same person; picked empirically for face_recognition's 128-d embeddings.
const FACE_MATCH_THRESHOLD = 0.6;
const MIN_TAG_CONFIDENCE = 0.4;

/**
 * Runs the full ML pipeline for one asset (CLIP embedding, YOLO tags, face
 * detection + clustering) and persists every result. Called once per asset,
 * right after upload/backup - never on read, so browsing the library never
 * re-triggers inference.
 */
export async function runMlPipeline(assetId: string, userId: string, relativePath: string): Promise<void> {
  const [embeddingResult, objectsResult, facesResult] = await Promise.all([
    getClipEmbedding(relativePath).catch(() => null),
    detectObjects(relativePath).catch(() => null),
    detectFaces(relativePath).catch(() => null),
  ]);

  if (embeddingResult) {
    await prisma.assetEmbedding.upsert({
      where: { assetId },
      create: { assetId, vector: floatsToBuffer(embeddingResult.embedding) },
      update: { vector: floatsToBuffer(embeddingResult.embedding) },
    });
  }

  if (objectsResult) {
    await prisma.tag.deleteMany({ where: { assetId, source: "yolo" } });
    const tags = objectsResult.objects.filter((o) => o.confidence >= MIN_TAG_CONFIDENCE);
    if (tags.length > 0) {
      await prisma.tag.createMany({
        data: tags.map((tag) => ({
          assetId,
          label: tag.label,
          confidence: tag.confidence,
          source: "yolo" as const,
        })),
      });
    }
  }

  if (facesResult && facesResult.faces.length > 0) {
    await prisma.faceDetection.deleteMany({ where: { assetId } });

    const existingFaces = await prisma.face.findMany({
      where: { userId },
      select: { id: true, embedding: true },
    });

    for (const detected of facesResult.faces) {
      const matchedFace = findMatchingFace(existingFaces, detected.embedding);

      const face =
        matchedFace ??
        (await prisma.face.create({
          data: {
            userId,
            embedding: floatsToBuffer(detected.embedding),
            sampleAssetId: assetId,
          },
        }));

      if (!matchedFace) {
        existingFaces.push(face);
      }

      await prisma.faceDetection.create({
        data: {
          assetId,
          faceId: face.id,
          x: detected.x,
          y: detected.y,
          w: detected.w,
          h: detected.h,
          confidence: detected.confidence,
        },
      });
    }
  }
}

function findMatchingFace(
  existingFaces: { id: string; embedding: Buffer }[],
  candidateEmbedding: number[],
): { id: string; embedding: Buffer } | undefined {
  return existingFaces.find(
    (face) => cosineSimilarity(bufferToFloats(face.embedding), candidateEmbedding) >= FACE_MATCH_THRESHOLD,
  );
}

import { prisma } from "@photos/database";
import { bufferToFloats, detectFaces, detectObjects, extractOcrText, floatsToBuffer, getClipEmbedding } from "@photos/shared";

// face_recognition (dlib) embeddings are compared by *Euclidean distance*;
// 0.6 is the library's documented default tolerance. (Using 0.6 as a cosine
// *similarity* floor is far too loose and merges different people.)
const FACE_MATCH_MAX_DISTANCE = 0.6;
const MIN_TAG_CONFIDENCE = 0.4;

// Serializes the DB-write phase per user inside this worker process. Without
// it, two concurrent jobs (concurrency: 2, or the admin "rescan" button
// re-enqueuing an asset that is still in flight) can interleave their
// deleteMany/create calls and produce duplicate tags/detections, or both
// create a new Face cluster for the same person.
// NOTE: only effective with a single backup-worker replica.
const userLocks = new Map<string, Promise<void>>();

async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const previous = userLocks.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => (release = resolve));
  const chained = previous.then(() => current);
  userLocks.set(userId, chained);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (userLocks.get(userId) === chained) userLocks.delete(userId);
  }
}

/**
 * Runs the full ML pipeline for one asset (CLIP embedding, YOLO tags, face
 * detection + clustering) and persists every result. Called once per asset,
 * right after upload/backup - never on read, so browsing the library never
 * re-triggers inference.
 *
 * Successful steps are persisted even if another step fails; the job is then
 * failed so BullMQ retries it (all writes are idempotent per asset).
 */
export async function runMlPipeline(assetId: string, userId: string, relativePath: string): Promise<void> {
  const [embeddingSettled, objectsSettled, facesSettled, ocrSettled] = await Promise.allSettled([
    getClipEmbedding(relativePath),
    detectObjects(relativePath),
    detectFaces(relativePath),
    extractOcrText(relativePath),
  ]);

  await withUserLock(userId, async () => {
    if (embeddingSettled.status === "fulfilled") {
      const vector = floatsToBuffer(embeddingSettled.value.embedding);
      await prisma.assetEmbedding.upsert({
        where: { assetId },
        create: { assetId, vector },
        update: { vector },
      });
    }

    if (objectsSettled.status === "fulfilled") {
      const tags = objectsSettled.value.objects.filter((o) => o.confidence >= MIN_TAG_CONFIDENCE);
      await prisma.$transaction([
        prisma.tag.deleteMany({ where: { assetId, source: "yolo" } }),
        prisma.tag.createMany({
          data: tags.map((tag) => ({
            assetId,
            label: tag.label,
            confidence: tag.confidence,
            source: "yolo" as const,
          })),
        }),
      ]);
    }

    if (facesSettled.status === "fulfilled") {
      const detectedFaces = facesSettled.value.faces;
      await prisma.$transaction(async (tx) => {
        // Always clear: a re-run that finds no faces must remove stale detections.
        await tx.faceDetection.deleteMany({ where: { assetId } });
        if (detectedFaces.length === 0) return;

        const existingFaces = (
          await tx.face.findMany({ where: { userId }, select: { id: true, embedding: true } })
        ).map((face) => ({ id: face.id, vector: bufferToFloats(face.embedding) }));

        for (const detected of detectedFaces) {
          let faceId = findMatchingFaceId(existingFaces, detected.embedding);
          if (!faceId) {
            const created = await tx.face.create({
              data: { userId, embedding: floatsToBuffer(detected.embedding), sampleAssetId: assetId },
              select: { id: true },
            });
            faceId = created.id;
            existingFaces.push({ id: faceId, vector: detected.embedding });
          }

          await tx.faceDetection.create({
            data: {
              assetId,
              faceId,
              x: detected.x,
              y: detected.y,
              w: detected.w,
              h: detected.h,
              confidence: detected.confidence,
            },
          });
        }
      }, { timeout: 30_000 });
    }
  });

  // OCR is stored outside the user lock (no race condition: one asset = one update)
  if (ocrSettled.status === "fulfilled" && ocrSettled.value.text) {
    await prisma.asset.update({
      where: { id: assetId },
      data: { ocrText: ocrSettled.value.text },
    });
  }

  const failures = [
    ["embed/image", embeddingSettled],
    ["detect/objects", objectsSettled],
    ["detect/faces", facesSettled],
    // OCR failures are non-fatal: many photos have no text, and pytesseract may
    // not be installed. A 503 from the ml-service (not installed) is treated as
    // a soft failure so the rest of the pipeline still succeeds.
    ...(ocrSettled.status === "rejected" && !String((ocrSettled as PromiseRejectedResult).reason).includes("503")
      ? [["ocr", ocrSettled] as const]
      : []),
  ] as const;
  const errors = failures
    .filter(([, result]) => result.status === "rejected")
    .map(([step, result]) => `${step}: ${String((result as PromiseRejectedResult).reason)}`);
  if (errors.length > 0) {
    throw new Error(`ml-pipeline for asset ${assetId} partially failed - ${errors.join("; ")}`);
  }
}

/** Closest existing face within the tolerance (not merely the first one that passes). */
function findMatchingFaceId(existingFaces: { id: string; vector: number[] }[], candidate: number[]): string | undefined {
  let bestId: string | undefined;
  let bestDistance = FACE_MATCH_MAX_DISTANCE;
  for (const face of existingFaces) {
    const distance = euclideanDistance(face.vector, candidate);
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestId = face.id;
    }
  }
  return bestId;
}

function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    sum += d * d;
  }
  return Math.sqrt(sum);
}

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";
const ML_INTERNAL_KEY = process.env.ML_INTERNAL_KEY ?? "";
// A hung ml-service call (container restarting, model load stuck, ...) used
// to block a BullMQ worker slot forever - concurrency is only 2, so two
// stuck jobs stalled the whole pipeline for every user. Generous default
// since a cold model load on constrained NAS hardware can genuinely take a
// while; overridable via env for slower setups.
const ML_SERVICE_TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS ?? 60_000);

/**
 * Thin HTTP client for the ml-service container. Both backend and ml-service
 * mount the same /photos volume, so we pass the asset's relative path rather
 * than shipping image bytes over the wire.
 */

export interface ClipEmbeddingResult {
  embedding: number[];
}

export interface DetectedObject {
  label: string;
  confidence: number;
}

export interface DetectedFace {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
  embedding: number[];
}

async function post<T>(endpoint: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ML_SERVICE_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (ML_INTERNAL_KEY) headers["X-Internal-Key"] = ML_INTERNAL_KEY;

    const response = await fetch(`${ML_SERVICE_URL}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ml-service ${endpoint} failed: ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`ml-service ${endpoint} timed out after ${ML_SERVICE_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function getClipEmbedding(relativePath: string): Promise<ClipEmbeddingResult> {
  return post<ClipEmbeddingResult>("/embed/image", { path: relativePath });
}

export function getClipTextEmbedding(query: string): Promise<ClipEmbeddingResult> {
  return post<ClipEmbeddingResult>("/embed/text", { text: query });
}

export function detectObjects(relativePath: string): Promise<{ objects: DetectedObject[] }> {
  return post<{ objects: DetectedObject[] }>("/detect/objects", { path: relativePath });
}

export function detectFaces(relativePath: string): Promise<{ faces: DetectedFace[] }> {
  return post<{ faces: DetectedFace[] }>("/detect/faces", { path: relativePath });
}

export function extractOcrText(relativePath: string): Promise<{ text: string }> {
  return post<{ text: string }>("/ocr", { path: relativePath });
}

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";

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
  const response = await fetch(`${ML_SERVICE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`ml-service ${endpoint} failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
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

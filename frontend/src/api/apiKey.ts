import { apiJson } from "./client";

const API_KEY_STORAGE_KEY = "photos.apiKey";

interface CreatedApiKey {
  key: string;
}

/**
 * The API key lives only in this browser's localStorage - the server never
 * returns the raw value again after creation. If it's missing (new device,
 * cleared storage) we just mint a fresh one; old ones stay valid until
 * revoked in Settings.
 */
export async function ensureApiKey(): Promise<string> {
  const existing = localStorage.getItem(API_KEY_STORAGE_KEY);
  if (existing) return existing;

  const created = await apiJson<CreatedApiKey>("/auth/api-keys", {
    method: "POST",
    body: JSON.stringify({ name: "Web-Browser" }),
  });
  localStorage.setItem(API_KEY_STORAGE_KEY, created.key);
  return created.key;
}

export function getStoredApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

/**
 * Builds a directly embeddable, authenticated URL for <img src>, <video src>
 * etc. - no fetch-and-blob dance required.
 */
export function imageUrl(path: string): string {
  const apiKey = getStoredApiKey();
  const separator = path.includes("?") ? "&" : "?";
  return `/api${path}${apiKey ? `${separator}apiKey=${encodeURIComponent(apiKey)}` : ""}`;
}

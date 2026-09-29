import { apiJson } from "./client";

const API_KEY_STORAGE_KEY = "photos.apiKey";
const API_KEY_ID_STORAGE_KEY = "photos.apiKeyId";

interface CreatedApiKey {
  id: string;
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
  localStorage.setItem(API_KEY_ID_STORAGE_KEY, created.id);
  return created.key;
}

export function getStoredApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

/** Revokes the server-side key, then removes local storage entries. */
export function revokeAndClearApiKey(): void {
  const id = localStorage.getItem(API_KEY_ID_STORAGE_KEY);
  if (id) {
    apiJson(`/auth/api-keys/${id}`, { method: "DELETE" }).catch(() => {});
  }
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  localStorage.removeItem(API_KEY_ID_STORAGE_KEY);
}

/** @deprecated use revokeAndClearApiKey – kept for callers that clear on auth error without a server round-trip */
export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  localStorage.removeItem(API_KEY_ID_STORAGE_KEY);
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

import { apiJson } from "./client";
import type { Asset, AssetsPage, EditOperations, MapPoint, Memory } from "./types";

/** Days a trashed asset stays restorable before the backend purges it. */
export const TRASH_RETENTION_DAYS = 30;

export function listAssets(filter: string, cursor: string | null): Promise<AssetsPage> {
  const params = new URLSearchParams(filter);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return apiJson<AssetsPage>(`/assets${query ? `?${query}` : ""}`);
}

export function fetchMapPoints(): Promise<MapPoint[]> {
  return apiJson<{ points: MapPoint[] }>("/assets/map").then((data) => data.points);
}

export function fetchMemories(): Promise<Memory[]> {
  return apiJson<{ memories: Memory[] }>("/assets/memories").then((data) => data.memories);
}

/** Moves the asset to the trash - restorable for TRASH_RETENTION_DAYS. */
export function moveToTrash(id: string): Promise<void> {
  return apiJson<void>(`/assets/${id}`, { method: "DELETE" });
}

export function restoreFromTrash(id: string): Promise<void> {
  return apiJson<void>(`/assets/${id}/restore`, { method: "POST" });
}

/** Irreversible - only works for assets that are already in the trash. */
export function deletePermanently(id: string): Promise<void> {
  return apiJson<void>(`/assets/${id}/permanent`, { method: "DELETE" });
}

export function setArchived(id: string, isArchived: boolean): Promise<Asset> {
  return apiJson<Asset>(`/assets/${id}`, { method: "PUT", body: JSON.stringify({ isArchived }) });
}

export function editAsset(id: string, ops: EditOperations): Promise<Asset> {
  return apiJson<Asset>(`/assets/${id}/edit`, { method: "POST", body: JSON.stringify(ops) });
}

export function revertAsset(id: string): Promise<Asset> {
  return apiJson<Asset>(`/assets/${id}/revert`, { method: "POST" });
}

/** Groups >=2 photos into one stack. `primaryAssetId` defaults to `assetIds[0]`
 * on the server - the cover tile that stays visible in normal listings. */
export function stackAssets(assetIds: string[], primaryAssetId?: string): Promise<void> {
  return apiJson<void>("/assets/stack", { method: "POST", body: JSON.stringify({ assetIds, primaryAssetId }) });
}

/** All members of the stack `id` belongs to (primary or child - either works). */
export function fetchStack(id: string): Promise<Asset[]> {
  return apiJson<{ assets: Asset[] }>(`/assets/${id}/stack`).then((data) => data.assets);
}

/** Removes `id` from its stack if it's a member, or dissolves the whole stack if it's the primary. */
export function unstackAsset(id: string): Promise<void> {
  return apiJson<void>(`/assets/${id}/stack`, { method: "DELETE" });
}

/** "Vor 3 Jahren" / "Vor 1 Jahr" */
export function yearsAgoLabel(yearsAgo: number): string {
  return yearsAgo === 1 ? "Vor 1 Jahr" : `Vor ${yearsAgo} Jahren`;
}

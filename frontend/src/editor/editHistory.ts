import type { Asset } from "../api/types";
import type { AppliedEdit } from "./editMath";

/**
 * Remembers the last edit applied to an asset (in this browser).
 *
 * The backend always re-renders edits from the original but doesn't expose
 * which operations are currently applied - and the editor only sees the
 * already-edited file. To let a second edit build on the first (instead of
 * silently replacing it with crop coordinates that point somewhere else),
 * we store what we sent. The stored result dimensions/byte size act as a
 * staleness check: if the asset's current file doesn't match (reverted/edited elsewhere),
 * the entry is ignored.
 */
interface StoredEdit extends AppliedEdit {
  resultWidth: number | null;
  resultHeight: number | null;
  resultSize: number | null;
}

/** The asset fields that identify one concrete rendered file. */
type FileSignature = Pick<Asset, "id" | "width" | "height" | "size">;

const PREFIX = "photos.edit.";

export function loadAppliedEdit(asset: FileSignature): AppliedEdit | null {
  try {
    const raw = localStorage.getItem(PREFIX + asset.id);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredEdit;
    // Re-encoded files practically never keep the exact byte size, so this
    // also catches brightness-only edits that were reverted elsewhere.
    if (stored.resultWidth !== asset.width || stored.resultHeight !== asset.height || stored.resultSize !== asset.size) {
      return null;
    }
    return { rotate: stored.rotate, crop: stored.crop, brightness: stored.brightness, contrast: stored.contrast };
  } catch {
    return null;
  }
}

export function saveAppliedEdit(assetId: string, edit: AppliedEdit, result: FileSignature): void {
  try {
    const stored: StoredEdit = { ...edit, resultWidth: result.width, resultHeight: result.height, resultSize: result.size };
    localStorage.setItem(PREFIX + assetId, JSON.stringify(stored));
  } catch {
    // Storage full/blocked - next edit just starts from the current file.
  }
}

export function clearAppliedEdit(assetId: string): void {
  try {
    localStorage.removeItem(PREFIX + assetId);
  } catch {
    // ignore
  }
}

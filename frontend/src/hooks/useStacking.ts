import { useState } from "react";
import { ApiError } from "../api/client";
import { stackAssets } from "../api/assets";
import type { Asset } from "../api/types";

/**
 * Multi-select + "Stapeln" for a photo grid (Mediathek/Album). Reused by
 * TimelinePage and AlbumDetailPage instead of duplicating the selection
 * state and the local list patch-up in both places.
 *
 * `updateAssets` gets the same updater-function shape as a `useState` setter
 * (`(prev) => next`), so a plain `setAssets` works directly; pages that keep
 * their assets nested in a bigger object (e.g. `album.assets`) just wrap it.
 */
export function useStacking(updateAssets: (updater: (assets: Asset[]) => Asset[]) => void) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openStackId, setOpenStackId] = useState<string | null>(null);

  function enterSelection() {
    setError(null);
    setSelectionMode(true);
  }

  function exitSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setError(null);
  }

  function toggleSelect(asset: Asset) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(asset.id)) next.delete(asset.id);
      else next.add(asset.id);
      return next;
    });
  }

  async function stackSelected() {
    const ids = [...selectedIds];
    if (ids.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      // First selected photo becomes the stack's cover - matches the
      // server's own default when primaryAssetId is omitted.
      const primaryId = ids[0];
      await stackAssets(ids, primaryId);
      updateAssets((prev) =>
        prev
          .filter((a) => a.id === primaryId || !ids.includes(a.id))
          .map((a) => (a.id === primaryId ? { ...a, stackCount: ids.length - 1 } : a)),
      );
      exitSelection();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Stapeln fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return {
    selectionMode,
    selectedIds,
    busy,
    error,
    openStackId,
    enterSelection,
    exitSelection,
    toggleSelect,
    stackSelected,
    openStack: setOpenStackId,
    closeStack: () => setOpenStackId(null),
  };
}

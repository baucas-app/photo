import { useState } from "react";
import { ApiError } from "../api/client";
import { deletePermanently, restoreFromTrash, TRASH_RETENTION_DAYS } from "../api/assets";
import type { Asset } from "../api/types";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PhotoGrid } from "../components/PhotoGrid";
import { usePaginatedAssets } from "../hooks/usePaginatedAssets";

function daysLeft(deletedAt: string | null | undefined): number | null {
  if (!deletedAt) return null;
  const purgeAt = new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function TrashPage() {
  const { assets, loading, done, error, loadMore, removeAsset, sentinelRef } = usePaginatedAssets("trashed=true");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAsset, setConfirmAsset] = useState<Asset | null>(null);

  async function run(asset: Asset, action: (id: string) => Promise<void>, failMessage: string) {
    setBusyId(asset.id);
    setActionError(null);
    try {
      await action(asset.id);
      removeAsset(asset.id);
      return true;
    } catch (err) {
      setActionError(err instanceof ApiError ? `${failMessage}: ${err.message}` : failMessage);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function onConfirmPermanentDelete() {
    if (!confirmAsset) return;
    await run(confirmAsset, deletePermanently, "Endgültiges Löschen fehlgeschlagen");
    setConfirmAsset(null);
  }

  return (
    <div>
      <h2>Papierkorb</h2>
      <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
        Gelöschte Fotos bleiben {TRASH_RETENTION_DAYS} Tage hier und können wiederhergestellt werden. Danach werden sie
        automatisch endgültig gelöscht.
      </p>

      {actionError && <p className="error-text">{actionError}</p>}

      <PhotoGrid
        assets={assets}
        groupByDay={false}
        renderTileFooter={(asset) => {
          const remaining = daysLeft(asset.deletedAt);
          const busy = busyId === asset.id;
          return (
            <>
              {remaining !== null && (
                <div className="photo-tile-caption">
                  {remaining === 0 ? "Wird heute gelöscht" : `Noch ${remaining} ${remaining === 1 ? "Tag" : "Tage"}`}
                </div>
              )}
              <div className="photo-tile-actions">
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => void run(asset, restoreFromTrash, "Wiederherstellen fehlgeschlagen")}
                >
                  Wiederherstellen
                </button>
                <button className="btn danger" disabled={busy} onClick={() => setConfirmAsset(asset)}>
                  Endgültig löschen
                </button>
              </div>
            </>
          );
        }}
      />

      {!done && !error && <div ref={sentinelRef} style={{ height: 1 }} />}
      {loading && <p>Lädt…</p>}
      {error && (
        <p className="error-text">
          {error}{" "}
          <button className="btn secondary" onClick={() => void loadMore()}>
            Erneut versuchen
          </button>
        </p>
      )}
      {assets.length === 0 && !loading && !error && <p>Der Papierkorb ist leer.</p>}

      {confirmAsset && (
        <ConfirmDialog
          title="Endgültig löschen?"
          confirmLabel="Endgültig löschen"
          danger
          busy={busyId === confirmAsset.id}
          onConfirm={() => void onConfirmPermanentDelete()}
          onCancel={() => setConfirmAsset(null)}
        >
          <p>
            „{confirmAsset.filename}“ wird unwiderruflich vom Server gelöscht – inklusive Original und aller
            Bearbeitungen. Das kann nicht rückgängig gemacht werden.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

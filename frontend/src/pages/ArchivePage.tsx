import { useState } from "react";
import { ApiError } from "../api/client";
import { setArchived } from "../api/assets";
import { PhotoGrid } from "../components/PhotoGrid";
import { usePaginatedAssets } from "../hooks/usePaginatedAssets";

export function ArchivePage() {
  const { assets, loading, done, error, loadMore, removeAsset, sentinelRef } = usePaginatedAssets("archived=true");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function unarchive(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      await setArchived(id, false);
      removeAsset(id);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Konnte nicht aus dem Archiv geholt werden");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h2>Archiv</h2>
      <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
        Archivierte Fotos sind aus der Mediathek und den Erinnerungen ausgeblendet, aber nicht gelöscht.
      </p>

      {actionError && <p className="error-text">{actionError}</p>}

      <PhotoGrid
        assets={assets}
        renderTileFooter={(asset) => (
          <div className="photo-tile-actions">
            <button className="btn secondary" disabled={busyId === asset.id} onClick={() => void unarchive(asset.id)}>
              Aus Archiv holen
            </button>
          </div>
        )}
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
      {assets.length === 0 && !loading && !error && (
        <p>Das Archiv ist leer. Fotos kannst du in der Einzelansicht über „Archivieren“ hierher verschieben.</p>
      )}
    </div>
  );
}

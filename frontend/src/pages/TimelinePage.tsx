import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiJson } from "../api/client";
import { useAssetUpload } from "../hooks/useAssetUpload";
import { useStacking } from "../hooks/useStacking";
import type { Asset } from "../api/types";
import { PhotoGrid } from "../components/PhotoGrid";
import { MemoriesPreview } from "../components/MemoriesPreview";
import { SelectionToolbar } from "../components/SelectionToolbar";
import { StackModal } from "../components/StackModal";
import { Slideshow } from "../components/Slideshow";

interface AssetsResponse {
  assets: Asset[];
  nextCursor: string | null;
}

function sortByDate(a: Asset, b: Asset): number {
  const ta = a.takenAt ?? a.uploadedAt;
  const tb = b.takenAt ?? b.uploadedAt;
  return tb < ta ? -1 : tb > ta ? 1 : 0;
}

export function TimelinePage() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { progress: uploadProgress, uploadFiles } = useAssetUpload();
  const stacking = useStacking(setAssets);
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [showPartner, setShowPartner] = useState(false);
  const [partnerAssets, setPartnerAssets] = useState<Asset[]>([]);
  const [partnerLoading, setPartnerLoading] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  // Synchronous in-flight guard: the `loading` state is only visible after a
  // re-render, so the mount effect, StrictMode's double effect and the
  // IntersectionObserver could otherwise all fetch the same cursor.
  const inFlightRef = useRef(false);

  const displayAssets = showPartner
    ? [...assets, ...partnerAssets].sort(sortByDate).filter(
        (a, i, arr) => arr.findIndex((b) => b.id === a.id) === i
      )
    : assets;

  const loadMore = useCallback(async () => {
    if (inFlightRef.current || done) return;
    inFlightRef.current = true;
    setLoading(true);
    setLoadError(null);
    try {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const page = await apiJson<AssetsResponse>(`/assets${query}`);
      // Dedupe: freshly uploaded assets are prepended locally and would
      // show up a second time once the page containing them is reached.
      setAssets((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...page.assets.filter((a) => !seen.has(a.id))];
      });
      setCursor(page.nextCursor);
      if (!page.nextCursor) setDone(true);
    } catch {
      setLoadError("Fotos konnten nicht geladen werden.");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [cursor, done]);

  useEffect(() => {
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showPartner) {
      setPartnerAssets([]);
      return;
    }
    setPartnerLoading(true);
    apiJson<{ assets: Asset[] }>("/partner/assets")
      .then((res) => setPartnerAssets(res.assets))
      .catch(() => {})
      .finally(() => setPartnerLoading(false));
  }, [showPartner]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, loadError]);

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files.length > 0) {
      void uploadFiles(e.dataTransfer.files, (uploaded) => setAssets((prev) => [...uploaded, ...prev]));
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={onDrop}
      style={{
        outline: isDraggingOver ? "2px dashed var(--color-accent)" : "none",
        outlineOffset: -8,
        borderRadius: 8,
        minHeight: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Mediathek</h2>
        {stacking.selectionMode ? (
          <SelectionToolbar
            count={stacking.selectedIds.size}
            busy={stacking.busy}
            error={stacking.error}
            onStack={() => void stacking.stackSelected()}
            onCancel={stacking.exitSelection}
          />
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className={`btn secondary${showPartner ? " active" : ""}`}
              onClick={() => setShowPartner((p) => !p)}
              title="Partner-Fotos einblenden"
            >
              {partnerLoading ? "…" : showPartner ? "👥 Partner an" : "👥 Partner"}
            </button>
            <button className="btn secondary" onClick={stacking.enterSelection} disabled={assets.length < 2}>
              Auswählen
            </button>
            <button className="btn secondary" onClick={() => setShowSlideshow(true)} disabled={assets.length === 0}>
              Diashow
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              style={{ display: "none" }}
              onChange={(e) =>
                e.target.files && uploadFiles(e.target.files, (uploaded) => setAssets((prev) => [...uploaded, ...prev]))
              }
            />
            <button className="btn" onClick={() => fileInputRef.current?.click()}>
              Hochladen
            </button>
          </div>
        )}
      </div>

      {uploadProgress && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          Lade hoch: {uploadProgress.done} / {uploadProgress.total}
        </p>
      )}

      {!stacking.selectionMode && <MemoriesPreview />}

      {showPartner && partnerAssets.length > 0 && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "4px 0" }}>
          + {partnerAssets.length} Partner-Fotos eingeblendet
        </p>
      )}

      <PhotoGrid
        assets={displayAssets}
        selectedIds={stacking.selectionMode ? stacking.selectedIds : undefined}
        onToggleSelect={stacking.toggleSelect}
        onOpenStack={(asset) => stacking.openStack(asset.id)}
      />
      {!done && !loadError && <div ref={sentinelRef} style={{ height: 1 }} />}
      {loading && <p>Lädt…</p>}
      {loadError && (
        <p className="error-text">
          {loadError}{" "}
          <button className="btn secondary" onClick={() => void loadMore()}>
            Erneut versuchen
          </button>
        </p>
      )}
      {assets.length === 0 && !loading && !loadError && (
        <p>Noch keine Fotos vorhanden. Zieh Dateien hierher oder klicke auf „Hochladen“.</p>
      )}

      {stacking.openStackId && (
        <StackModal
          assetId={stacking.openStackId}
          onClose={stacking.closeStack}
          // Auflösen/Herauslösen ändert, welche Fotos hier einzeln sichtbar
          // sind - ein frisches Laden ist einfacher als das lokal exakt nachzuführen.
          onChanged={() => navigate(0)}
        />
      )}

      {showSlideshow && <Slideshow assets={displayAssets} onClose={() => setShowSlideshow(false)} />}
    </div>
  );
}

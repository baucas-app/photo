import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { apiJson } from "../api/client";
import { useAssetUpload } from "../hooks/useAssetUpload";
import type { Asset } from "../api/types";
import { PhotoGrid } from "../components/PhotoGrid";

interface AssetsResponse {
  assets: Asset[];
  nextCursor: string | null;
}

export function TimelinePage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { progress: uploadProgress, uploadFiles } = useAssetUpload();

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    const query = cursor ? `?cursor=${cursor}` : "";
    const page = await apiJson<AssetsResponse>(`/assets${query}`);
    setAssets((prev) => [...prev, ...page.assets]);
    setCursor(page.nextCursor);
    if (!page.nextCursor) setDone(true);
    setLoading(false);
  }, [cursor, done, loading]);

  useEffect(() => {
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2>Mediathek</h2>
        <div>
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
      </div>

      {uploadProgress && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          Lade hoch: {uploadProgress.done} / {uploadProgress.total}
        </p>
      )}

      <PhotoGrid assets={assets} />
      {!done && <div ref={sentinelRef} style={{ height: 1 }} />}
      {loading && <p>Lädt…</p>}
      {assets.length === 0 && !loading && (
        <p>Noch keine Fotos vorhanden. Zieh Dateien hierher oder klicke auf „Hochladen“.</p>
      )}
    </div>
  );
}

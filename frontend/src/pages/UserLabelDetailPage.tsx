import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiJson } from "../api/client";
import type { Asset, UserLabel } from "../api/types";
import { PhotoGrid } from "../components/PhotoGrid";

export function UserLabelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [label, setLabel] = useState<UserLabel | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiJson<UserLabel>(`/user-labels/${id}`),
      apiJson<{ assets: Asset[]; nextCursor: string | null }>(`/user-labels/${id}/assets`),
    ])
      .then(([l, page]) => {
        setLabel(l);
        setAssets(page.assets);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function loadMore() {
    if (!id || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await apiJson<{ assets: Asset[]; nextCursor: string | null }>(
        `/user-labels/${id}/assets?cursor=${encodeURIComponent(nextCursor)}`
      );
      setAssets((prev) => [...prev, ...page.assets]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) return <p>Lädt…</p>;
  if (!label) return <p className="error-text">Label nicht gefunden.</p>;

  return (
    <div>
      <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {label.color && (
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: label.color,
            }}
          />
        )}
        {label.name}
        <span style={{ fontSize: 16, fontWeight: "normal", color: "var(--color-text-muted)" }}>
          {assets.length} Foto{assets.length !== 1 ? "s" : ""}
        </span>
      </h2>

      {assets.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)" }}>Noch keine Fotos mit diesem Label.</p>
      ) : (
        <>
          <PhotoGrid assets={assets} />
          {nextCursor && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button className="btn secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? "Lädt…" : "Mehr laden"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

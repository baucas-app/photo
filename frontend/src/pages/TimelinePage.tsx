import { useCallback, useEffect, useRef, useState } from "react";
import { apiJson } from "../api/client";
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
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  return (
    <div>
      <h2>Mediathek</h2>
      <PhotoGrid assets={assets} />
      {!done && <div ref={sentinelRef} style={{ height: 1 }} />}
      {loading && <p>Lädt…</p>}
      {assets.length === 0 && !loading && <p>Noch keine Fotos vorhanden.</p>}
    </div>
  );
}

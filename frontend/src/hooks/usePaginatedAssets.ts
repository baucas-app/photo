import { useCallback, useEffect, useRef, useState } from "react";
import { listAssets } from "../api/assets";
import type { Asset } from "../api/types";

/**
 * Cursor-paginated `GET /assets?<filter>` with infinite scroll - the same
 * pattern as TimelinePage, reusable for Archive and Trash. Attach
 * `sentinelRef` to an element at the end of the list.
 */
export function usePaginatedAssets(filter: string) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Synchronous in-flight guard (see TimelinePage for the reasoning).
  const inFlightRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (inFlightRef.current || done) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const page = await listAssets(filter, cursor);
      setAssets((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...page.assets.filter((a) => !seen.has(a.id))];
      });
      setCursor(page.nextCursor);
      if (!page.nextCursor) setDone(true);
    } catch {
      setError("Fotos konnten nicht geladen werden.");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [filter, cursor, done]);

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
  }, [loadMore, error, done]);

  /** Drops an asset locally, e.g. after it was restored/unarchived/deleted. */
  const removeAsset = useCallback((id: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { assets, loading, done, error, loadMore, removeAsset, sentinelRef };
}

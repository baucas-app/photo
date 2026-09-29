import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiJson } from "../api/client";
import type { Asset } from "../api/types";
import { PhotoGrid } from "../components/PhotoGrid";

interface CameraStat {
  cameraMake: string | null;
  cameraModel: string | null;
  count: number;
}

interface TagStat {
  label: string;
  count: number;
}

interface SearchResult {
  asset: Asset;
  score: number;
}

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Asset[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameraStats, setCameraStats] = useState<CameraStat[]>([]);
  const [tagStats, setTagStats] = useState<TagStat[]>([]);

  useEffect(() => {
    apiJson<CameraStat[]>("/stats/cameras").then(setCameraStats);
    apiJson<TagStat[]>("/tags").then(setTagStats);
  }, []);

  const [error, setError] = useState<string | null>(null);
  // Monotonic request id: a slow earlier search/filter must not overwrite the
  // results of a later one (tag/camera buttons stay clickable while loading).
  const requestIdRef = useRef(0);

  async function runRequest(displayLabel: string, fetchAssets: () => Promise<Asset[]>) {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setQuery(displayLabel);
    try {
      const assets = await fetchAssets();
      if (requestId === requestIdRef.current) setResults(assets);
    } catch {
      if (requestId === requestIdRef.current) setError("Suche fehlgeschlagen.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  async function runSearch(q: string) {
    if (!q.trim()) return;
    await runRequest(q, async () => {
      const data = await apiJson<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(q)}`);
      return data.results.map((r) => r.asset);
    });
  }

  async function filterByCamera(model: string | null) {
    if (!model) return;
    await filterByAssetsQuery(model, `cameraModel=${encodeURIComponent(model)}`);
  }

  async function filterByTag(label: string) {
    await filterByAssetsQuery(label, `tag=${encodeURIComponent(label)}`);
  }

  async function filterByAssetsQuery(displayLabel: string, queryString: string) {
    await runRequest(displayLabel, async () => {
      const all: Asset[] = [];
      let cursor: string | null = null;
      for (;;) {
        const cursorPart: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
        const data = await apiJson<{ assets: Asset[]; nextCursor: string | null }>(
          `/assets?${queryString}${cursorPart}`
        );
        all.push(...data.assets);
        if (!data.nextCursor) break;
        cursor = data.nextCursor;
      }
      return all;
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void runSearch(query);
  }

  return (
    <div>
      <h2>Suche</h2>
      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          placeholder="z.B. „Strand“, „Geburtstag“, „Hund“…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, padding: 8, border: "1px solid var(--color-border)", borderRadius: 6 }}
        />
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Suche…" : "Suchen"}
        </button>
      </form>

      {tagStats.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h3 className="day-heading">Erkannte Objekte</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tagStats.map((tag) => (
              <button
                key={tag.label}
                className="btn secondary"
                style={{ fontSize: 13 }}
                onClick={() => filterByTag(tag.label)}
              >
                {tag.label} · {tag.count}
              </button>
            ))}
          </div>
        </section>
      )}

      {cameraStats.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h3 className="day-heading">Aufnahmegeräte</h3>
          <div className="stat-row" style={{ flexWrap: "wrap" }}>
            {cameraStats.map((stat) => (
              <button
                key={`${stat.cameraMake}-${stat.cameraModel}`}
                className="stat-card"
                style={{ border: "none", cursor: "pointer", textAlign: "left" }}
                onClick={() => filterByCamera(stat.cameraModel)}
              >
                <div className="value">{stat.count}</div>
                <div className="label">
                  {stat.cameraMake} {stat.cameraModel}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {error && <p className="error-text">{error}</p>}
      {results && <PhotoGrid assets={results} />}
      {results && results.length === 0 && <p>Keine Treffer für „{query}“.</p>}
    </div>
  );
}

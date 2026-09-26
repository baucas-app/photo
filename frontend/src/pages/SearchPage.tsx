import { useEffect, useState, type FormEvent } from "react";
import { apiJson } from "../api/client";
import type { Asset } from "../api/types";
import { PhotoGrid } from "../components/PhotoGrid";

interface CameraStat {
  cameraMake: string | null;
  cameraModel: string | null;
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

  useEffect(() => {
    apiJson<CameraStat[]>("/stats/cameras").then(setCameraStats);
  }, []);

  async function runSearch(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setQuery(q);
    try {
      const data = await apiJson<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(q)}`);
      setResults(data.results.map((r) => r.asset));
    } finally {
      setLoading(false);
    }
  }

  async function filterByCamera(model: string | null) {
    if (!model) return;
    setLoading(true);
    setQuery(model);
    try {
      const data = await apiJson<{ assets: Asset[] }>(`/assets?cameraModel=${encodeURIComponent(model)}`);
      setResults(data.assets);
    } finally {
      setLoading(false);
    }
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

      {results && <PhotoGrid assets={results} />}
      {results && results.length === 0 && <p>Keine Treffer für „{query}“.</p>}
    </div>
  );
}

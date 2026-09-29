import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiJson } from "../api/client";
import type { Asset } from "../api/types";

interface SmartAlbum {
  id: string;
  name: string;
  rules: { field: string; op: string; value: string }[];
}

export function SmartAlbumDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [album, setAlbum] = useState<SmartAlbum | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiJson<SmartAlbum>(`/smart-albums/${id}`),
      apiJson<{ assets: Asset[] }>(`/smart-albums/${id}/assets`),
    ]).then(([a, page]) => {
      setAlbum(a);
      setAssets(page.assets);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page-container"><p>Laden…</p></div>;
  if (!album) return <div className="page-container"><p>Album nicht gefunden.</p></div>;

  return (
    <div className="page-container">
      <div style={{ marginBottom: 16 }}>
        <Link to="/smart-albums" style={{ color: "var(--text-secondary)", fontSize: 14 }}>← Smart Albums</Link>
        <h1 style={{ marginTop: 8, marginBottom: 4 }}>{album.name}</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 0 }}>
          {assets.length} Foto{assets.length !== 1 ? "s" : ""}
        </p>
      </div>
      {assets.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>Keine Fotos entsprechen diesen Regeln.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 4,
          }}
        >
          {assets.map((asset) => (
            <Link key={asset.id} to={`/viewer/${asset.id}`}>
              <img
                src={`/api/assets/${asset.id}/thumbnail`}
                alt={asset.filename}
                style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block", borderRadius: 4 }}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

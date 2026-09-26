import { useEffect, useState } from "react";
import { apiJson } from "../api/client";
import { imageUrl } from "../api/apiKey";

interface DuplicateAsset {
  id: string;
  filename: string;
  path: string;
  size: number | null;
  takenAt: string | null;
  uploadedAt: string;
}

interface DuplicateGroup {
  hash: string;
  assets: DuplicateAsset[];
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "?";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DuplicatesPage() {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);

  const reload = () =>
    apiJson<{ groups: DuplicateGroup[] }>("/assets/duplicates").then((data) => setGroups(data.groups));

  useEffect(() => {
    void reload();
  }, []);

  async function deleteAsset(id: string) {
    await apiJson(`/assets/${id}`, { method: "DELETE" });
    await reload();
  }

  if (!groups) return <p>Suche nach Duplikaten…</p>;

  return (
    <div>
      <h2>Duplikate</h2>
      <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
        Erkannt über Perceptual Hash - findet auch unterschiedlich große/komprimierte Kopien desselben Fotos, nicht
        nur byteidentische Dateien.
      </p>

      {groups.length === 0 && <p>Keine Duplikate gefunden.</p>}

      {groups.map((group) => (
        <section key={group.hash} style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {group.assets.map((asset) => (
              <div key={asset.id} style={{ width: 160 }}>
                <figure style={{ margin: 0, aspectRatio: 1, borderRadius: 8, overflow: "hidden" }}>
                  <img
                    src={imageUrl(`/assets/${asset.id}/thumbnail`)}
                    alt={asset.filename}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </figure>
                <div style={{ fontSize: 12, marginTop: 4 }}>{asset.filename}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{formatBytes(asset.size)}</div>
                <button className="btn danger" style={{ marginTop: 4, width: "100%" }} onClick={() => deleteAsset(asset.id)}>
                  Löschen
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

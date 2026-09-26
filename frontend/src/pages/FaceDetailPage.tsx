import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { apiJson } from "../api/client";
import type { Asset } from "../api/types";
import { PhotoGrid } from "../components/PhotoGrid";

export function FaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!id) return;
    apiJson<{ assets: Asset[] }>(`/faces/${id}/assets`).then((data) => setAssets(data.assets));
  }, [id]);

  async function onRename(e: FormEvent) {
    e.preventDefault();
    if (!id || !name.trim()) return;
    await apiJson(`/faces/${id}`, { method: "PUT", body: JSON.stringify({ personName: name }) });
  }

  return (
    <div>
      <p>
        <Link to="/faces">← Personen</Link>
      </p>
      <form onSubmit={onRename} style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input placeholder="Name dieser Person" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit">
          Speichern
        </button>
      </form>
      <PhotoGrid assets={assets} />
    </div>
  );
}

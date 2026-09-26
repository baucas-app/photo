import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiJson } from "../api/client";
import type { AlbumDetail } from "../api/types";
import { PhotoGrid } from "../components/PhotoGrid";

export function AlbumDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);

  useEffect(() => {
    if (!id) return;
    apiJson<AlbumDetail>(`/albums/${id}`).then(setAlbum);
  }, [id]);

  if (!album) return <p>Lädt…</p>;

  return (
    <div>
      <p>
        <Link to="/albums">← Alben</Link>
      </p>
      <h2>{album.name}</h2>
      {album.description && <p>{album.description}</p>}

      {album.children.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          {album.children.map((child) => (
            <Link key={child.id} to={`/albums/${child.id}`} className="btn secondary">
              {child.name}
            </Link>
          ))}
        </div>
      )}

      <PhotoGrid assets={album.assets} />
      {album.assets.length === 0 && <p>Dieses Album enthält noch keine Fotos.</p>}
    </div>
  );
}

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { useAssetUpload } from "../hooks/useAssetUpload";
import type { AlbumDetail } from "../api/types";
import { PhotoGrid } from "../components/PhotoGrid";

export function AlbumDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { progress: uploadProgress, uploadFiles } = useAssetUpload(id);

  useEffect(() => {
    if (!id) return;
    apiJson<AlbumDetail>(`/albums/${id}`).then(setAlbum);
  }, [id]);

  if (!album) return <p>Lädt…</p>;

  function prependAssets(uploaded: AlbumDetail["assets"]) {
    setAlbum((prev) => (prev ? { ...prev, assets: [...uploaded, ...prev.assets] } : prev));
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files, prependAssets);
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
      <p>
        <Link to="/albums">← Alben</Link>
      </p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2>{album.name}</h2>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={(e) => e.target.files && uploadFiles(e.target.files, prependAssets)}
          />
          <button className="btn" onClick={() => fileInputRef.current?.click()}>
            Hochladen
          </button>
        </div>
      </div>
      {album.description && <p>{album.description}</p>}

      {uploadProgress && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          Lade hoch: {uploadProgress.done} / {uploadProgress.total}
        </p>
      )}

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
      {album.assets.length === 0 && <p>Dieses Album enthält noch keine Fotos. Zieh Dateien hierher oder lade welche hoch.</p>}
    </div>
  );
}

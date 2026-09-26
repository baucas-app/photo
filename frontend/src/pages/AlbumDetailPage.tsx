import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson, ApiError } from "../api/client";
import { useAssetUpload } from "../hooks/useAssetUpload";
import type { Album, AlbumDetail } from "../api/types";
import { PhotoGrid } from "../components/PhotoGrid";

export function AlbumDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [allAlbums, setAllAlbums] = useState<Album[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [parentInput, setParentInput] = useState<string>("");
  const [manageError, setManageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { progress: uploadProgress, uploadFiles } = useAssetUpload(id);

  useEffect(() => {
    if (!id) return;
    apiJson<AlbumDetail>(`/albums/${id}`).then((data) => {
      setAlbum(data);
      setNameInput(data.name);
      setParentInput(data.parentId ?? "");
    });
    apiJson<Album[]>("/albums").then(setAllAlbums);
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

  async function onSaveManage(e: FormEvent) {
    e.preventDefault();
    if (!id || !album) return;
    setManageError(null);
    try {
      const updated = await apiJson<Album>(`/albums/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name: nameInput, parentId: parentInput || null }),
      });
      setShowManage(false);
      if (updated.path !== album.path) {
        // Path changed (rename and/or move) - just reload this page fresh.
        navigate(0);
      } else {
        setAlbum((prev) => (prev ? { ...prev, name: updated.name } : prev));
      }
    } catch (err) {
      setManageError(err instanceof ApiError ? err.message : "Konnte Album nicht aktualisieren");
    }
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
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn secondary" onClick={() => setShowManage((v) => !v)}>
            Verwalten
          </button>
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

      {showManage && (
        <form
          onSubmit={onSaveManage}
          style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0", flexWrap: "wrap" }}
        >
          <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Name" required />
          <select value={parentInput} onChange={(e) => setParentInput(e.target.value)}>
            <option value="">(kein übergeordnetes Album)</option>
            {allAlbums
              .filter((a) => a.id !== album.id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.path}
                </option>
              ))}
          </select>
          <button className="btn" type="submit">
            Speichern
          </button>
          {manageError && <span className="error-text">{manageError}</span>}
        </form>
      )}

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

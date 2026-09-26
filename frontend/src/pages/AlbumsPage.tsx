import { useEffect, useState, type FormEvent } from "react";
import { apiJson, ApiError } from "../api/client";
import type { Album } from "../api/types";
import { AlbumTree } from "../components/AlbumTree";

export function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = () => apiJson<Album[]>("/albums").then(setAlbums);

  useEffect(() => {
    void reload();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiJson("/albums", { method: "POST", body: JSON.stringify({ name }) });
      setName("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Album konnte nicht erstellt werden");
    }
  }

  return (
    <div>
      <h2>Alben</h2>
      <form onSubmit={onCreate} style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input placeholder="Neues Album" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="btn" type="submit">
          Erstellen
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
      <AlbumTree albums={albums} />
      {albums.length === 0 && <p>Noch keine Alben vorhanden.</p>}
    </div>
  );
}

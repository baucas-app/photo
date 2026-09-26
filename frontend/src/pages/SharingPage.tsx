import { useEffect, useState } from "react";
import { apiJson, ApiError } from "../api/client";
import type { Album, SharedLink } from "../api/types";

export function SharingPage() {
  const [links, setLinks] = useState<SharedLink[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = () => apiJson<SharedLink[]>("/shared-links").then(setLinks);

  useEffect(() => {
    void reload();
    apiJson<Album[]>("/albums").then(setAlbums);
  }, []);

  async function createLink() {
    if (!selectedAlbum) return;
    setError(null);
    try {
      await apiJson(`/albums/${selectedAlbum}/share`, {
        method: "POST",
        body: JSON.stringify(password ? { password } : {}),
      });
      setPassword("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Link konnte nicht erstellt werden");
    }
  }

  async function revokeLink(albumId: string) {
    await apiJson(`/albums/${albumId}/share`, { method: "DELETE" });
    await reload();
  }

  return (
    <div>
      <h2>Freigaben</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 24, alignItems: "center" }}>
        <select value={selectedAlbum} onChange={(e) => setSelectedAlbum(e.target.value)}>
          <option value="">Album wählen…</option>
          {albums.map((album) => (
            <option key={album.id} value={album.id}>
              {album.path}
            </option>
          ))}
        </select>
        <input
          type="password"
          placeholder="Passwort (optional)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn" onClick={createLink} disabled={!selectedAlbum}>
          Link erstellen
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Album</th>
            <th>Link</th>
            <th>Läuft ab</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <tr key={link.id}>
              <td>{link.album.path}</td>
              <td>
                <code>{`${window.location.origin}/share/${link.token}`}</code>
              </td>
              <td>{link.expiresAt ? new Date(link.expiresAt).toLocaleDateString("de-DE") : "nie"}</td>
              <td>
                <button className="btn danger" onClick={() => revokeLink(link.albumId)}>
                  Entfernen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {links.length === 0 && <p>Noch keine geteilten Links.</p>}
    </div>
  );
}

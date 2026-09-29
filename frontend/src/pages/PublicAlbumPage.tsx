import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import type { Asset } from "../api/types";

interface PublicAlbumResponse {
  album: { id: string; name: string; description: string | null };
  assets: Asset[];
}

export function PublicAlbumPage() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [data, setData] = useState<PublicAlbumResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  // Password that successfully unlocked the album - the thumbnail endpoint
  // checks it too, so it has to be appended to every image URL.
  const [unlockedWith, setUnlockedWith] = useState<string | undefined>(undefined);

  async function load(withPassword?: string) {
    setError(null);
    try {
      const query = withPassword ? `?password=${encodeURIComponent(withPassword)}` : "";
      const response = await fetch(`/api/public/albums/${token}${query}`);
      if (response.status === 401) {
        setNeedsPassword(true);
        if (withPassword) setError("Falsches Passwort");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Fehler" }));
        throw new ApiError(response.status, body.error);
      }
      setData(await response.json());
      setUnlockedWith(withPassword);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Album konnte nicht geladen werden");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void load(password);
  }

  if (needsPassword && !data) {
    return (
      <form className="auth-form" onSubmit={onSubmit}>
        <h1>Geschütztes Album</h1>
        <input
          type="password"
          placeholder="Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <span className="error-text">{error}</span>}
        <button className="btn" type="submit">
          Öffnen
        </button>
      </form>
    );
  }

  if (error) return <p className="error-text" style={{ padding: 24 }}>{error}</p>;
  if (!data) return <p style={{ padding: 24 }}>Lädt…</p>;

  return (
    <div style={{ padding: 24 }}>
      <h1>{data.album.name}</h1>
      {data.album.description && <p>{data.album.description}</p>}
      <div className="photo-grid">
        {data.assets.map((asset) => (
          <figure key={asset.id}>
            <img
              src={`/api/public/albums/${token}/assets/${asset.id}/thumbnail${
                unlockedWith ? `?password=${encodeURIComponent(unlockedWith)}` : ""
              }`}
              alt={asset.filename}
            />
          </figure>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { apiJson } from "../api/client";
import { useAuth } from "../hooks/useAuth";

interface ApiKeyInfo {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface Overview {
  totalAssets: number;
  favorites: number;
  videos: number;
  byYear: { year: number; count: number }[];
}

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const reloadKeys = () => apiJson<ApiKeyInfo[]>("/auth/api-keys").then(setApiKeys);

  useEffect(() => {
    void reloadKeys();
    apiJson<Overview>("/stats/overview").then(setOverview);
  }, []);

  async function createKey() {
    const created = await apiJson<{ key: string }>("/auth/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: keyName || "Neuer Key" }),
    });
    setNewKey(created.key);
    setKeyName("");
    await reloadKeys();
  }

  async function revokeKey(id: string) {
    await apiJson(`/auth/api-keys/${id}`, { method: "DELETE" });
    await reloadKeys();
  }

  return (
    <div>
      <h2>Einstellungen</h2>

      <section style={{ marginBottom: 32 }}>
        <h3 className="day-heading">Account</h3>
        <p>
          {user?.name ?? user?.email} · {user?.role === "admin" ? "Admin" : "Benutzer"}
        </p>
        <button className="btn secondary" onClick={logout}>
          Abmelden
        </button>
      </section>

      {overview && (
        <section style={{ marginBottom: 32 }}>
          <h3 className="day-heading">Übersicht</h3>
          <div className="stat-row">
            <div className="stat-card">
              <div className="value">{overview.totalAssets}</div>
              <div className="label">Fotos & Videos</div>
            </div>
            <div className="stat-card">
              <div className="value">{overview.favorites}</div>
              <div className="label">Favoriten</div>
            </div>
            <div className="stat-card">
              <div className="value">{overview.videos}</div>
              <div className="label">Videos</div>
            </div>
          </div>
        </section>
      )}

      <section>
        <h3 className="day-heading">API-Keys</h3>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          API-Keys erlauben direkten Bild-Zugriff (z.B. <code>?apiKey=…</code>) ohne Login-Header - praktisch für
          eingebettete Bilder oder externe Tools.
        </p>
        {newKey && (
          <p style={{ fontSize: 13, background: "var(--color-surface)", padding: 12, borderRadius: 6 }}>
            Neuer Key (wird nur einmal angezeigt): <code>{newKey}</code>
          </p>
        )}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input placeholder="Name (z.B. Laptop)" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
          <button className="btn" onClick={createKey}>
            Neuen Key erstellen
          </button>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Erstellt</th>
              <th>Zuletzt genutzt</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((key) => (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td>{new Date(key.createdAt).toLocaleDateString("de-DE")}</td>
                <td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString("de-DE") : "nie"}</td>
                <td>
                  <button className="btn danger" onClick={() => revokeKey(key.id)}>
                    Widerrufen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

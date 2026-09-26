import { useEffect, useState } from "react";
import { apiJson } from "../api/client";
import type { User } from "../api/types";

interface Stats {
  userCount: number;
  assetCount: number;
  storageBytes: number;
}

interface GitStatus {
  currentCommit: string;
  currentMessage: string;
  remoteCommit: string;
  updateAvailable: boolean;
}

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return `${gb.toFixed(2)} GB`;
}

export function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string | null>(null);

  function reload() {
    apiJson<Stats>("/admin/stats").then(setStats);
    apiJson<User[]>("/admin/users").then(setUsers);
    apiJson<GitStatus>("/admin/git-status").then(setGitStatus).catch(() => setGitStatus(null));
  }

  useEffect(reload, []);

  async function rescan() {
    setBusy(true);
    try {
      await apiJson("/admin/ml/rescan", { method: "POST" });
    } finally {
      setBusy(false);
    }
  }

  async function gitUpdate() {
    setBusy(true);
    setLog(null);
    try {
      const result = await apiJson<{ success: boolean; log: string }>("/admin/git-update", { method: "POST" });
      setLog(result.log);
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Admin</h2>

      {stats && (
        <div className="stat-row">
          <div className="stat-card">
            <div className="value">{stats.userCount}</div>
            <div className="label">Benutzer</div>
          </div>
          <div className="stat-card">
            <div className="value">{stats.assetCount}</div>
            <div className="label">Fotos & Videos</div>
          </div>
          <div className="stat-card">
            <div className="value">{formatBytes(stats.storageBytes)}</div>
            <div className="label">Speicherplatz</div>
          </div>
        </div>
      )}

      <section style={{ marginBottom: 32 }}>
        <h3 className="day-heading">Benutzer</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>E-Mail</th>
              <th>Name</th>
              <th>Rolle</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name}</td>
                <td>{u.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 className="day-heading">ML-Pipeline</h3>
        <button className="btn" onClick={rescan} disabled={busy}>
          Alle Fotos neu analysieren
        </button>
      </section>

      <section>
        <h3 className="day-heading">Server-Update</h3>
        {gitStatus && (
          <p style={{ fontSize: 13 }}>
            Aktueller Commit: <code>{gitStatus.currentCommit.slice(0, 8)}</code> ({gitStatus.currentMessage})
            <br />
            {gitStatus.updateAvailable ? "Update verfügbar" : "Auf dem neuesten Stand"}
          </p>
        )}
        <button className="btn" onClick={gitUpdate} disabled={busy}>
          Update laden & neustarten
        </button>
        {log && <pre style={{ background: "var(--color-surface)", padding: 12, marginTop: 12 }}>{log}</pre>}
      </section>
    </div>
  );
}

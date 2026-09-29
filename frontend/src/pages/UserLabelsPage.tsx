import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiJson, ApiError } from "../api/client";
import type { UserLabel } from "../api/types";

function buildTree(labels: UserLabel[]): (UserLabel & { children: UserLabel[] })[] {
  const map = new Map(labels.map((l) => [l.id, { ...l, children: [] as UserLabel[] }]));
  const roots: (UserLabel & { children: UserLabel[] })[] = [];
  for (const l of map.values()) {
    if (l.parentId && map.has(l.parentId)) {
      map.get(l.parentId)!.children.push(l);
    } else {
      roots.push(l);
    }
  }
  return roots;
}

function LabelRow({
  label,
  depth,
  onDelete,
  onRename,
}: {
  label: UserLabel & { children: UserLabel[] };
  depth: number;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label.name);

  function save() {
    if (name.trim() && name.trim() !== label.name) {
      onRename(label.id, name.trim());
    }
    setEditing(false);
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingLeft: depth * 20,
          padding: `6px 8px 6px ${8 + depth * 20}px`,
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {label.color && (
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: label.color,
              flexShrink: 0,
            }}
          />
        )}
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
            style={{ flex: 1, fontSize: 14 }}
          />
        ) : (
          <Link
            to={`/user-labels/${label.id}`}
            style={{ flex: 1, textDecoration: "none", color: "inherit", fontSize: 14 }}
          >
            {label.name}
            {label.assetCount != null && (
              <span style={{ marginLeft: 6, color: "var(--color-text-muted)", fontSize: 12 }}>
                {label.assetCount}
              </span>
            )}
          </Link>
        )}
        <button className="btn secondary" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => setEditing(!editing)}>
          Umbenennen
        </button>
        <button
          className="btn danger"
          style={{ fontSize: 12, padding: "2px 8px" }}
          onClick={() => {
            if (confirm(`Label "${label.name}" löschen?`)) onDelete(label.id);
          }}
        >
          Löschen
        </button>
      </div>
      {label.children.map((child) => (
        <LabelRow
          key={child.id}
          label={child as UserLabel & { children: UserLabel[] }}
          depth={depth + 1}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}
    </>
  );
}

export function UserLabelsPage() {
  const [labels, setLabels] = useState<UserLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [parentId, setParentId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    apiJson<UserLabel[]>("/user-labels")
      .then(setLabels)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { void reload(); }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    try {
      await apiJson("/user-labels", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          color: newColor,
          parentId: parentId || null,
        }),
      });
      setNewName("");
      setParentId("");
      void reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Fehler beim Erstellen");
    }
  }

  async function onDelete(id: string) {
    await apiJson(`/user-labels/${id}`, { method: "DELETE" }).catch(() => {});
    void reload();
  }

  async function onRename(id: string, name: string) {
    await apiJson(`/user-labels/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }).catch(() => {});
    void reload();
  }

  if (loading) return <p>Lädt…</p>;

  const tree = buildTree(labels);

  return (
    <div style={{ maxWidth: 640 }}>
      <h2>Eigene Labels</h2>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 24, fontSize: 14 }}>
        Erstelle eigene Labels mit Hierarchie (z.&nbsp;B. Natur &gt; Tiere &gt; Hund) und weise sie Fotos im Viewer zu.
      </p>

      <form
        onSubmit={(e) => void onCreate(e)}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24, alignItems: "flex-end" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 160 }}>
          <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Name</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Label-Name"
            required
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Farbe</label>
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ width: 40, height: 34 }} />
        </div>
        {labels.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Eltern-Label (optional)</label>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— keines —</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        )}
        <button className="btn" type="submit">Erstellen</button>
      </form>

      {error && <p className="error-text">{error}</p>}

      {tree.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)" }}>Noch keine Labels erstellt.</p>
      ) : (
        <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }}>
          {tree.map((label) => (
            <LabelRow key={label.id} label={label} depth={0} onDelete={(id) => void onDelete(id)} onRename={(id, n) => void onRename(id, n)} />
          ))}
        </div>
      )}
    </div>
  );
}

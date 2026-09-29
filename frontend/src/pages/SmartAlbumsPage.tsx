import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson, apiFetch } from "../api/client";

interface SmartAlbumRule {
  field:
    | "tag"
    | "cameraModel"
    | "cameraMake"
    | "takenAfter"
    | "takenBefore"
    | "isFavorite"
    | "locationCity"
    | "locationCountry"
    | "ocrContains";
  op: "eq" | "contains" | "before" | "after" | "is";
  value: string;
}

interface SmartAlbum {
  id: string;
  name: string;
  rules: SmartAlbumRule[];
  createdAt: string;
  updatedAt: string;
}

const FIELD_LABELS: Record<SmartAlbumRule["field"], string> = {
  tag: "Tag",
  cameraModel: "Kameramodell",
  cameraMake: "Kamerahersteller",
  takenAfter: "Aufgenommen nach",
  takenBefore: "Aufgenommen vor",
  isFavorite: "Favorit",
  locationCity: "Stadt",
  locationCountry: "Land",
  ocrContains: "Erkannter Text enthält",
};

function emptyRule(): SmartAlbumRule {
  return { field: "tag", op: "eq", value: "" };
}

export function SmartAlbumsPage() {
  const [albums, setAlbums] = useState<SmartAlbum[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editAlbum, setEditAlbum] = useState<SmartAlbum | null>(null);

  const load = async () => {
    const data = await apiJson<SmartAlbum[]>("/smart-albums");
    setAlbums(data);
  };

  useEffect(() => { load(); }, []);

  const del = async (id: string) => {
    if (!confirm("Smart Album löschen?")) return;
    await apiFetch(`/smart-albums/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="page-container">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Smart Albums</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Neu</button>
      </div>

      {albums.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>
          Noch keine Smart Albums. Erstelle eines mit gespeicherten Suchregeln – es füllt sich automatisch.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {albums.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                background: "var(--surface)",
                borderRadius: 8,
                border: "1px solid var(--border)",
              }}
            >
              <Link to={`/smart-albums/${a.id}`} style={{ flex: 1, textDecoration: "none", color: "inherit" }}>
                <div style={{ fontWeight: 600 }}>{a.name}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                  {a.rules.map((r) => `${FIELD_LABELS[r.field]}: ${r.value}`).join(" · ")}
                </div>
              </Link>
              <button className="btn-ghost" onClick={() => setEditAlbum(a)}>Bearbeiten</button>
              <button className="btn-ghost btn-danger" onClick={() => del(a.id)}>Löschen</button>
            </div>
          ))}
        </div>
      )}

      {(showCreate || editAlbum) && (
        <SmartAlbumEditor
          existing={editAlbum ?? undefined}
          onClose={() => { setShowCreate(false); setEditAlbum(null); load(); }}
        />
      )}
    </div>
  );
}

function SmartAlbumEditor({
  existing,
  onClose,
}: {
  existing?: SmartAlbum;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [rules, setRules] = useState<SmartAlbumRule[]>(existing?.rules ?? [emptyRule()]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const body = { name, rules: rules.filter((r) => r.value.trim()) };
      if (existing) {
        await apiJson(`/smart-albums/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiJson("/smart-albums", { method: "POST", body: JSON.stringify(body) });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>{existing ? "Smart Album bearbeiten" : "Neues Smart Album"}</h2>
        <label style={{ display: "block", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Name</span>
          <input
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Sommerurlaub"
            style={{ display: "block", width: "100%", marginTop: 4 }}
          />
        </label>
        <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13 }}>Regeln</div>
        {rules.map((rule, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <select
              value={rule.field}
              onChange={(e) => {
                const r = [...rules];
                r[i] = { ...r[i], field: e.target.value as SmartAlbumRule["field"] };
                setRules(r);
              }}
              className="select-input"
            >
              {Object.entries(FIELD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {rule.field === "isFavorite" ? (
              <select
                value={rule.value}
                onChange={(e) => { const r = [...rules]; r[i] = { ...r[i], value: e.target.value }; setRules(r); }}
                className="select-input"
                style={{ flex: 1 }}
              >
                <option value="true">Ja</option>
                <option value="false">Nein</option>
              </select>
            ) : (
              <input
                className="text-input"
                value={rule.value}
                onChange={(e) => { const r = [...rules]; r[i] = { ...r[i], value: e.target.value }; setRules(r); }}
                placeholder={rule.field.includes("After") || rule.field.includes("Before") ? "JJJJ-MM-TT" : "Wert"}
                style={{ flex: 1 }}
              />
            )}
            <button
              className="btn-ghost btn-danger"
              onClick={() => setRules(rules.filter((_, j) => j !== i))}
              disabled={rules.length === 1}
            >✕</button>
          </div>
        ))}
        <button className="btn-ghost" onClick={() => setRules([...rules, emptyRule()])}>+ Regel</button>
        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

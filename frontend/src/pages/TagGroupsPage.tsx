import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson, apiFetch } from "../api/client";

interface TagGroupLabel {
  id: string;
  label: string;
}

interface TagGroup {
  id: string;
  name: string;
  labels: TagGroupLabel[];
}

export function TagGroupsPage() {
  const [groups, setGroups] = useState<TagGroup[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editGroup, setEditGroup] = useState<TagGroup | null>(null);

  const load = async () => {
    const data = await apiJson<TagGroup[]>("/tag-groups");
    setGroups(data);
  };

  useEffect(() => { load(); }, []);

  const del = async (id: string) => {
    if (!confirm("Tag-Gruppe löschen?")) return;
    await apiFetch(`/tag-groups/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="page-container">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Tag-Gruppen</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Neue Gruppe</button>
      </div>

      <p style={{ color: "var(--text-secondary)", marginTop: 0, marginBottom: 24, fontSize: 14 }}>
        Fasse verwandte Tags zusammen – z.B. „Reisen" = Strand, Meer, Palme. So findest du alle
        Strand-Fotos ohne jeden Tag einzeln auszuwählen.
      </p>

      {groups.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>Noch keine Tag-Gruppen angelegt.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {groups.map((g) => (
            <div
              key={g.id}
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
              <Link to={`/tag-groups/${g.id}`} style={{ flex: 1, textDecoration: "none", color: "inherit" }}>
                <div style={{ fontWeight: 600 }}>{g.name}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                  {g.labels.map((l) => l.label).join(" · ")}
                </div>
              </Link>
              <button className="btn-ghost" onClick={() => setEditGroup(g)}>Bearbeiten</button>
              <button className="btn-ghost btn-danger" onClick={() => del(g.id)}>Löschen</button>
            </div>
          ))}
        </div>
      )}

      {(showCreate || editGroup) && (
        <TagGroupEditor
          existing={editGroup ?? undefined}
          onClose={() => { setShowCreate(false); setEditGroup(null); load(); }}
        />
      )}
    </div>
  );
}

function TagGroupEditor({ existing, onClose }: { existing?: TagGroup; onClose: () => void }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [labelsText, setLabelsText] = useState(existing?.labels.map((l) => l.label).join(", ") ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const labels = labelsText
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);
      const body = { name, labels };
      if (existing) {
        await apiJson(`/tag-groups/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiJson("/tag-groups", { method: "POST", body: JSON.stringify(body) });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h2 style={{ marginTop: 0 }}>{existing ? "Gruppe bearbeiten" : "Neue Tag-Gruppe"}</h2>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Gruppenname</span>
          <input
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Reisen"
            style={{ display: "block", width: "100%", marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Tags (durch Komma getrennt)</span>
          <textarea
            className="text-input"
            value={labelsText}
            onChange={(e) => setLabelsText(e.target.value)}
            placeholder="Strand, Meer, Palme, Urlaub"
            rows={3}
            style={{ display: "block", width: "100%", marginTop: 4, resize: "vertical" }}
          />
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

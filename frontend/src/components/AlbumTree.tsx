import { useEffect, useRef, useState, type DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiJson, ApiError } from "../api/client";
import type { Album, AlbumSortOrder } from "../api/types";

const SORT_LABELS: Record<AlbumSortOrder, string> = {
  takenAt_desc: "Aufnahmedatum (neu → alt)",
  takenAt_asc: "Aufnahmedatum (alt → neu)",
  uploadedAt_desc: "Hochladedatum (neu → alt)",
  name_asc: "Dateiname (A → Z)",
};

interface AlbumTreeProps {
  albums: Album[];
  onMoved: () => void;
}

interface AlbumMenuState {
  albumId: string;
  kind: "main" | "rename" | "sort" | "lock";
}

export function AlbumTree({ albums, onMoved }: AlbumTreeProps) {
  const navigate = useNavigate();
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<AlbumMenuState | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockPasswordInput, setLockPasswordInput] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const byParent = new Map<string | null, Album[]>();
  for (const album of albums) {
    const list = byParent.get(album.parentId) ?? [];
    list.push(album);
    byParent.set(album.parentId, list);
  }

  function isSelfOrDescendant(albumId: string, candidateId: string): boolean {
    const byId = new Map(albums.map((a) => [a.id, a]));
    let current: string | null = candidateId;
    while (current) {
      if (current === albumId) return true;
      current = byId.get(current)?.parentId ?? null;
    }
    return false;
  }

  async function moveTo(albumId: string, parentId: string | null) {
    setError(null);
    const album = albums.find((a) => a.id === albumId);
    if (!album || album.parentId === parentId) return;
    if (parentId && isSelfOrDescendant(albumId, parentId)) {
      setError("Ein Album kann nicht in sich selbst oder eines seiner Unteralben verschoben werden");
      return;
    }
    try {
      await apiJson(`/albums/${albumId}`, { method: "PUT", body: JSON.stringify({ parentId }) });
      onMoved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Album konnte nicht verschoben werden");
    }
  }

  async function renameAlbum(albumId: string, newName: string) {
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/albums/${albumId}`, { method: "PUT", body: JSON.stringify({ name: newName }) });
      setMenu(null);
      onMoved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Album konnte nicht umbenannt werden");
    } finally {
      setBusy(false);
    }
  }

  async function duplicateAlbum(albumId: string) {
    setBusy(true);
    setError(null);
    setMenu(null);
    try {
      const newAlbum = await apiJson<Album>(`/albums/${albumId}/duplicate`, { method: "POST" });
      onMoved();
      navigate(`/albums/${newAlbum.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Album konnte nicht dupliziert werden");
      setBusy(false);
    }
  }

  async function togglePin(album: Album) {
    setBusy(true);
    setError(null);
    setMenu(null);
    try {
      await apiJson(`/albums/${album.id}`, { method: "PUT", body: JSON.stringify({ pinned: !album.pinned }) });
      onMoved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Aktion fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function setLockWithPassword(albumId: string, password: string | null) {
    setBusy(true);
    setError(null);
    setMenu(null);
    try {
      // password = null means unlock (isLocked: false, clear password)
      if (password === null) {
        await apiJson(`/albums/${albumId}`, { method: "PUT", body: JSON.stringify({ isLocked: false, lockPassword: null }) });
      } else {
        await apiJson(`/albums/${albumId}`, { method: "PUT", body: JSON.stringify({ isLocked: true, lockPassword: password }) });
      }
      onMoved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Aktion fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function setSortOrder(albumId: string, sortOrder: AlbumSortOrder) {
    setBusy(true);
    setError(null);
    setMenu(null);
    try {
      await apiJson(`/albums/${albumId}`, { method: "PUT", body: JSON.stringify({ sortOrder }) });
      onMoved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sortierung konnte nicht gesetzt werden");
    } finally {
      setBusy(false);
    }
  }

  function dropTargetProps(targetId: string | null) {
    const key = targetId ?? "root";
    return {
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverId(key);
      },
      onDragLeave: () => setDragOverId((prev) => (prev === key ? null : prev)),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverId(null);
        const draggedId = e.dataTransfer.getData("text/album-id");
        if (draggedId && draggedId !== targetId) void moveTo(draggedId, targetId);
      },
      style: dragOverId === key ? { outline: "2px dashed var(--color-accent)", borderRadius: 6 } : undefined,
    };
  }

  function renderMenu(album: Album) {
    if (!menu || menu.albumId !== album.id) return null;

    if (menu.kind === "rename") {
      return (
        <div
          ref={menuRef}
          style={{ display: "inline-flex", gap: 4, alignItems: "center", marginLeft: 8 }}
        >
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            style={{ fontSize: 13, padding: "2px 6px", borderRadius: 4, border: "1px solid var(--color-border)" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameValue.trim()) void renameAlbum(album.id, renameValue.trim());
              if (e.key === "Escape") setMenu(null);
            }}
          />
          <button
            className="btn"
            style={{ padding: "2px 8px", fontSize: 12 }}
            disabled={!renameValue.trim() || busy}
            onClick={() => void renameAlbum(album.id, renameValue.trim())}
          >
            OK
          </button>
          <button
            className="btn secondary"
            style={{ padding: "2px 8px", fontSize: 12 }}
            onClick={() => setMenu(null)}
          >
            ✕
          </button>
        </div>
      );
    }

    if (menu.kind === "lock") {
      return (
        <div
          ref={menuRef}
          style={{
            position: "absolute",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            zIndex: 100,
            padding: 12,
            minWidth: 220,
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Album sperren</p>
          <input
            autoFocus
            type="password"
            placeholder="Passwort setzen"
            value={lockPasswordInput}
            onChange={(e) => setLockPasswordInput(e.target.value)}
            style={{ width: "100%", fontSize: 13, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--color-border)", boxSizing: "border-box" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && lockPasswordInput.trim()) void setLockWithPassword(album.id, lockPasswordInput.trim());
              if (e.key === "Escape") setMenu(null);
            }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button
              className="btn"
              style={{ flex: 1, fontSize: 12 }}
              disabled={!lockPasswordInput.trim() || busy}
              onClick={() => void setLockWithPassword(album.id, lockPasswordInput.trim())}
            >
              Sperren
            </button>
            <button className="btn secondary" style={{ fontSize: 12 }} onClick={() => setMenu(null)}>
              ✕
            </button>
          </div>
        </div>
      );
    }

    if (menu.kind === "sort") {
      return (
        <div
          ref={menuRef}
          style={{
            position: "absolute",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            zIndex: 100,
            minWidth: 220,
            padding: "4px 0",
          }}
        >
          {(Object.entries(SORT_LABELS) as [AlbumSortOrder, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => void setSortOrder(album.id, value)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "7px 14px",
                background: album.sortOrder === value ? "var(--color-accent-dim, rgba(0,122,255,0.1))" : "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: "var(--color-text)",
              }}
            >
              {album.sortOrder === value ? "✓ " : "  "}{label}
            </button>
          ))}
        </div>
      );
    }

    // main menu
    return (
      <div
        ref={menuRef}
        style={{
          position: "absolute",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          zIndex: 100,
          minWidth: 180,
          padding: "4px 0",
        }}
      >
        {[
          {
            label: "Umbenennen",
            action: () => {
              setRenameValue(album.name);
              setMenu({ albumId: album.id, kind: "rename" });
            },
          },
          {
            label: "Duplizieren",
            action: () => void duplicateAlbum(album.id),
          },
          {
            label: album.pinned ? "Nicht mehr anheften" : "Oben anheften",
            action: () => void togglePin(album),
          },
          {
            label: "Sortierung…",
            action: () => setMenu({ albumId: album.id, kind: "sort" }),
          },
          album.isLocked
            ? {
                label: "🔓 Entsperren",
                action: () => void setLockWithPassword(album.id, null),
              }
            : {
                label: "🔒 Sperren…",
                action: () => { setLockPasswordInput(""); setMenu({ albumId: album.id, kind: "lock" }); },
              },
        ].map(({ label, action }) => (
          <button
            key={label}
            onClick={action}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "7px 14px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              color: "var(--color-text)",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  function renderLevel(parentId: string | null) {
    const children = byParent.get(parentId);
    if (!children || children.length === 0) return null;
    return (
      <ul>
        {children.map((album) => (
          <li key={album.id} {...dropTargetProps(album.id)} style={{ position: "relative", ...dropTargetProps(album.id).style }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {album.pinned && (
                <span title="Angeheftet" style={{ fontSize: 11, opacity: 0.7 }}>📌</span>
              )}
              {album.isLocked && (
                <span title="Gesperrt" style={{ fontSize: 11, opacity: 0.7 }}>🔒</span>
              )}
              <Link
                to={`/albums/${album.id}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/album-id", album.id)}
              >
                {album.name}
              </Link>
              <button
                title="Aktionen"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu(menu?.albumId === album.id && menu.kind === "main" ? null : { albumId: album.id, kind: "main" });
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 4px",
                  fontSize: 14,
                  color: "var(--color-text-muted)",
                  lineHeight: 1,
                }}
              >
                ⋯
              </button>
            </span>
            {renderMenu(album)}
            {renderLevel(album.id)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div>
      {error && <p className="error-text">{error}</p>}
      <div className="album-tree" {...dropTargetProps(null)} style={{ padding: 4, ...dropTargetProps(null).style }}>
        {renderLevel(null)}
        {albums.length > 0 && (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            Zieh ein Album auf ein anderes, um es zu verschieben - oder hierher, um es an die oberste Ebene zu holen.
          </p>
        )}
      </div>
    </div>
  );
}

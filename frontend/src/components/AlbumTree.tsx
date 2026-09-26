import { useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { apiJson, ApiError } from "../api/client";
import type { Album } from "../api/types";

interface AlbumTreeProps {
  albums: Album[];
  onMoved: () => void;
}

export function AlbumTree({ albums, onMoved }: AlbumTreeProps) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byParent = new Map<string | null, Album[]>();
  for (const album of albums) {
    const list = byParent.get(album.parentId) ?? [];
    list.push(album);
    byParent.set(album.parentId, list);
  }

  async function moveTo(albumId: string, parentId: string | null) {
    setError(null);
    try {
      await apiJson(`/albums/${albumId}`, { method: "PUT", body: JSON.stringify({ parentId }) });
      onMoved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Album konnte nicht verschoben werden");
    }
  }

  function dropTargetProps(targetId: string | null) {
    const key = targetId ?? "root";
    return {
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        setDragOverId(key);
      },
      onDragLeave: () => setDragOverId((prev) => (prev === key ? null : prev)),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setDragOverId(null);
        const draggedId = e.dataTransfer.getData("text/album-id");
        if (draggedId && draggedId !== targetId) void moveTo(draggedId, targetId);
      },
      style: dragOverId === key ? { outline: "2px dashed var(--color-accent)", borderRadius: 6 } : undefined,
    };
  }

  function renderLevel(parentId: string | null) {
    const children = byParent.get(parentId);
    if (!children || children.length === 0) return null;
    return (
      <ul>
        {children.map((album) => (
          <li key={album.id} {...dropTargetProps(album.id)}>
            <Link
              to={`/albums/${album.id}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/album-id", album.id)}
            >
              {album.name}
            </Link>
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

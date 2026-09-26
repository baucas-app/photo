import { Link } from "react-router-dom";
import type { Album } from "../api/types";

export function AlbumTree({ albums }: { albums: Album[] }) {
  const byParent = new Map<string | null, Album[]>();
  for (const album of albums) {
    const list = byParent.get(album.parentId) ?? [];
    list.push(album);
    byParent.set(album.parentId, list);
  }

  function renderLevel(parentId: string | null) {
    const children = byParent.get(parentId);
    if (!children || children.length === 0) return null;
    return (
      <ul>
        {children.map((album) => (
          <li key={album.id}>
            <Link to={`/albums/${album.id}`}>{album.name}</Link>
            {renderLevel(album.id)}
          </li>
        ))}
      </ul>
    );
  }

  return <div className="album-tree">{renderLevel(null)}</div>;
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMemories, yearsAgoLabel } from "../api/assets";
import type { Memory } from "../api/types";
import { thumbnailUrl } from "./PhotoGrid";

/**
 * "Heute vor X Jahren" cards at the top of the Mediathek. Renders nothing
 * when there are no memories for today (or the request fails) - it's a
 * teaser, not something worth an error message.
 */
export function MemoriesPreview() {
  const [memories, setMemories] = useState<Memory[]>([]);

  useEffect(() => {
    fetchMemories()
      .then(setMemories)
      .catch(() => setMemories([]));
  }, []);

  if (memories.length === 0) return null;

  return (
    <section style={{ marginBottom: "var(--space-3)" }}>
      <h3 className="day-heading">Erinnerungen</h3>
      <div className="memory-cards">
        {memories.map((memory) => {
          const cover = memory.assets[0];
          return (
            <Link key={memory.year} to="/memories" className="memory-card">
              {cover && <img src={thumbnailUrl(cover)} alt="" loading="lazy" />}
              <div className="memory-card-label">
                <strong>{yearsAgoLabel(memory.yearsAgo)}</strong>
                <span>
                  {memory.assets.length} {memory.assets.length === 1 ? "Foto" : "Fotos"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

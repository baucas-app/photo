import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMemories, yearsAgoLabel } from "../api/assets";
import type { Memory } from "../api/types";
import { thumbnailUrl } from "../components/PhotoGrid";
import { isVideoAsset } from "../api/media";

export function MemoriesPage() {
  const navigate = useNavigate();
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMemories()
      .then(setMemories)
      .catch(() => setError("Erinnerungen konnten nicht geladen werden."));
  }, []);

  const today = new Date().toLocaleDateString("de-DE", { day: "numeric", month: "long" });

  return (
    <div>
      <h2>Erinnerungen</h2>
      <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Fotos vom {today} aus früheren Jahren.</p>

      {error && <p className="error-text">{error}</p>}
      {!memories && !error && <p>Lädt…</p>}
      {memories && memories.length === 0 && (
        <p>Für heute gibt es noch keine Erinnerungen – an diesem Tag wurden in früheren Jahren keine Fotos aufgenommen.</p>
      )}

      {memories?.map((memory) => (
        <section key={memory.year} className="memory-section">
          <h3 className="memory-heading">
            {yearsAgoLabel(memory.yearsAgo)}
            <span>
              {memory.year} · {memory.assets.length} {memory.assets.length === 1 ? "Foto" : "Fotos"}
            </span>
          </h3>
          <div className="memory-strip">
            {memory.assets.map((asset) => (
              <figure key={asset.id} onClick={() => navigate(`/viewer/${asset.id}`)}>
                <img src={thumbnailUrl(asset)} alt={asset.filename} loading="lazy" />
                {isVideoAsset(asset) && <span className="video-badge">▶</span>}
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

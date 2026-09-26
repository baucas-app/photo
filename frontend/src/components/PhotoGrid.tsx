import { useNavigate } from "react-router-dom";
import { imageUrl } from "../api/apiKey";
import type { Asset } from "../api/types";

function dayLabel(iso: string | null): string {
  const date = iso ? new Date(iso) : null;
  if (!date) return "Unbekanntes Datum";
  return date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function PhotoGrid({ assets }: { assets: Asset[] }) {
  const navigate = useNavigate();

  const groups: { label: string; items: Asset[] }[] = [];
  for (const asset of assets) {
    const label = dayLabel(asset.takenAt);
    const lastGroup = groups.at(-1);
    if (lastGroup?.label === label) {
      lastGroup.items.push(asset);
    } else {
      groups.push({ label, items: [asset] });
    }
  }

  return (
    <div>
      {groups.map((group) => (
        <section key={group.label}>
          <h3 className="day-heading">{group.label}</h3>
          <div className="photo-grid">
            {group.items.map((asset) => (
              <figure key={asset.id} onClick={() => navigate(`/viewer/${asset.id}`)}>
                <img src={imageUrl(`/assets/${asset.id}/thumbnail`)} alt={asset.filename} loading="lazy" />
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

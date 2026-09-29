import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { imageUrl } from "../api/apiKey";
import type { Asset } from "../api/types";
import { isRawAsset, isVideoAsset } from "../api/media";

function dayLabel(iso: string | null): string {
  const date = iso ? new Date(iso) : null;
  if (!date) return "Unbekanntes Datum";
  return date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/**
 * Thumbnail URL with a version parameter: the URL itself never changes when
 * a photo is edited, so without it the browser would keep showing the old
 * rendition until a hard reload. `size` changes on every edit/revert.
 */
export function thumbnailUrl(asset: Pick<Asset, "id" | "size">): string {
  return imageUrl(`/assets/${asset.id}/thumbnail${asset.size != null ? `?v=${asset.size}` : ""}`);
}

interface PhotoGridProps {
  assets: Asset[];
  /** Group under day headings (default). Off for e.g. the trash, which is sorted by deletion date. */
  groupByDay?: boolean;
  /** Extra per-tile content (buttons, captions) rendered below the thumbnail. */
  renderTileFooter?: (asset: Asset) => ReactNode;
  /** Multi-select mode for "Stapeln" - tiles show a checkbox and toggle instead of opening the viewer. */
  selectedIds?: Set<string>;
  onToggleSelect?: (asset: Asset) => void;
  /** Called instead of navigating to the viewer when a stacked cover tile (stackCount > 0) is clicked. */
  onOpenStack?: (asset: Asset) => void;
}

export function PhotoGrid({
  assets,
  groupByDay = true,
  renderTileFooter,
  selectedIds,
  onToggleSelect,
  onOpenStack,
}: PhotoGridProps) {
  const navigate = useNavigate();
  const selectionMode = selectedIds !== undefined;

  const groups: { label: string; items: Asset[] }[] = [];
  if (groupByDay) {
    for (const asset of assets) {
      const label = dayLabel(asset.takenAt);
      const lastGroup = groups.at(-1);
      if (lastGroup?.label === label) {
        lastGroup.items.push(asset);
      } else {
        groups.push({ label, items: [asset] });
      }
    }
  } else if (assets.length > 0) {
    groups.push({ label: "", items: assets });
  }

  return (
    <div>
      {/* Label alone isn't unique: search results (score order) or freshly
          prepended uploads can produce the same day in several groups. */}
      {groups.map((group, index) => (
        <section key={`${index}-${group.label}`}>
          {group.label && <h3 className="day-heading">{group.label}</h3>}
          <div className={renderTileFooter ? "photo-grid with-footer" : "photo-grid"}>
            {group.items.map((asset) => {
              const isSelected = selectedIds?.has(asset.id) ?? false;
              const stackCount = asset.stackCount ?? 0;

              const onTileClick = () => {
                if (selectionMode) {
                  onToggleSelect?.(asset);
                } else if (stackCount > 0 && onOpenStack) {
                  onOpenStack(asset);
                } else {
                  navigate(`/viewer/${asset.id}`);
                }
              };

              // Bottom-right corner: at most one media-type indicator (a
              // photo can't be several of these at once in practice).
              const mediaBadge = isVideoAsset(asset) ? (
                <span className="media-badge" aria-label="Video">
                  ▶
                </span>
              ) : asset.livePhotoVideoId ? (
                <span className="media-badge" aria-label="Live Photo">
                  LIVE
                </span>
              ) : asset.is360 ? (
                <span className="media-badge" aria-label="360°-Panorama">
                  360°
                </span>
              ) : isRawAsset(asset) ? (
                <span className="media-badge" aria-label="RAW-Bild">
                  RAW
                </span>
              ) : null;

              const figure = (
                <figure
                  key={asset.id}
                  onClick={onTileClick}
                  className={isSelected ? "selected" : undefined}
                >
                  <img src={thumbnailUrl(asset)} alt={asset.filename} loading="lazy" />
                  {mediaBadge}
                  {stackCount > 0 && (
                    <span className="stack-badge" aria-label={`Stapel mit ${stackCount + 1} Fotos`}>
                      ⧉ {stackCount + 1}
                    </span>
                  )}
                  {selectionMode && (
                    <span className={isSelected ? "select-checkbox checked" : "select-checkbox"} aria-hidden="true" />
                  )}
                </figure>
              );
              if (!renderTileFooter) return figure;
              return (
                <div key={asset.id} className="photo-tile">
                  {figure}
                  <div className="photo-tile-footer">{renderTileFooter(asset)}</div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

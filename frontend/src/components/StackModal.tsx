import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { fetchStack, unstackAsset } from "../api/assets";
import type { Asset } from "../api/types";
import { thumbnailUrl } from "./PhotoGrid";

interface StackModalProps {
  /** Any member's id (primary or child) - GET /assets/:id/stack resolves either. */
  assetId: string;
  onClose: () => void;
  /** Called after the stack was dissolved or a member removed - the caller's
   *  asset list is stale at that point (a freed photo re-appears standalone,
   *  the cover's stackCount changes) and should reload. */
  onChanged: () => void;
}

/** "Alle Mitglieder"-Ansicht eines Stapels: auflösen (ganzer Stapel) oder ein
 *  einzelnes Foto herauslösen, siehe GET/DELETE /assets/:id/stack. */
export function StackModal({ assetId, onClose, onChanged }: StackModalProps) {
  const navigate = useNavigate();
  const [members, setMembers] = useState<Asset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | "all" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStack(assetId)
      .then((assets) => !cancelled && setMembers(assets))
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : "Stapel konnte nicht geladen werden"));
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  // The primary is the one member with no stackParentId - GET /assets/:id/stack
  // returns bare asset rows (no computed stackCount here, unlike GET /assets).
  const primary = members?.find((m) => !m.stackParentId) ?? members?.[0] ?? null;

  async function dissolveAll() {
    if (!primary) return;
    setBusyId("all");
    setActionError(null);
    try {
      await unstackAsset(primary.id);
      onChanged();
      onClose();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Auflösen fehlgeschlagen");
      setBusyId(null);
    }
  }

  async function removeMember(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      await unstackAsset(id);
      const refreshed = await fetchStack(assetId).catch(() => null);
      // Once only the cover is left, the stack is gone - close and let the
      // caller reload rather than showing a "stack" of one photo.
      if (!refreshed || refreshed.length <= 1) {
        onChanged();
        onClose();
      } else {
        setMembers(refreshed);
        setBusyId(null);
      }
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Konnte nicht aus dem Stapel gelöst werden");
      setBusyId(null);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={() => busyId === null && onClose()}>
      <div className="dialog stack-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Stapel{members ? ` (${members.length} Fotos)` : ""}</h3>
          <button className="btn secondary" onClick={onClose} disabled={busyId !== null}>
            Schließen
          </button>
        </div>

        {loadError && <p className="error-text">{loadError}</p>}
        {actionError && <p className="error-text">{actionError}</p>}
        {!members && !loadError && <p>Lädt…</p>}

        {members && (
          <>
            <div className="stack-modal-grid">
              {members.map((member) => {
                const isPrimary = member.id === primary?.id;
                return (
                  <div key={member.id} className="stack-modal-tile">
                    <figure onClick={() => navigate(`/viewer/${member.id}`)}>
                      <img src={thumbnailUrl(member)} alt={member.filename} />
                    </figure>
                    {isPrimary ? (
                      <span className="stack-modal-tag">Hauptfoto</span>
                    ) : (
                      <button
                        className="btn secondary"
                        style={{ fontSize: 12, padding: "4px 8px" }}
                        onClick={() => void removeMember(member.id)}
                        disabled={busyId !== null}
                      >
                        {busyId === member.id ? "Löst…" : "Herauslösen"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="dialog-actions">
              <button className="btn danger" onClick={() => void dissolveAll()} disabled={busyId !== null}>
                {busyId === "all" ? "Löst auf…" : "Ganzen Stapel auflösen"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiJson, ApiError } from "../api/client";
import { imageUrl } from "../api/apiKey";
import { deletePermanently, moveToTrash, restoreFromTrash, setArchived, TRASH_RETENTION_DAYS } from "../api/assets";
import type { Asset, UserLabel } from "../api/types";
import { canBrowserDisplayOriginal, isRawAsset, isVideoAsset } from "../api/media";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PhotoEditor } from "../components/PhotoEditor";

// three.js is a sizeable dependency (see PanoramaViewer) - only 360° photos
// should pay for downloading it.
const PanoramaViewer = lazy(() => import("../components/PanoramaViewer").then((m) => ({ default: m.PanoramaViewer })));

function formatExposureTime(seconds: number): string {
  if (seconds >= 1) return `${seconds}s`;
  return `1/${Math.round(1 / seconds)}s`;
}

function formatExif(asset: Asset): string {
  const parts: string[] = [];
  if (asset.cameraModel) parts.push([asset.cameraMake, asset.cameraModel].filter(Boolean).join(" "));
  if (asset.lensModel) parts.push(asset.lensModel);
  if (asset.focalLength) parts.push(`${asset.focalLength}mm`);
  if (asset.fNumber) parts.push(`f/${asset.fNumber}`);
  if (asset.exposureTime) parts.push(formatExposureTime(asset.exposureTime));
  if (asset.iso) parts.push(`ISO ${asset.iso}`);
  return parts.join(" · ");
}

type Busy = "archive" | "trash" | "restore" | "delete" | null;

export function ViewerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [livePlaying, setLivePlaying] = useState(false);
  // User labels
  const [assignedLabels, setAssignedLabels] = useState<UserLabel[]>([]);
  const [allLabels, setAllLabels] = useState<UserLabel[]>([]);
  const [showLabelPicker, setShowLabelPicker] = useState(false);

  useEffect(() => {
    if (!id) return;
    setVideoFailed(false);
    setEditing(false);
    setActionError(null);
    setLoadError(null);
    setLivePlaying(false);
    setShowLabelPicker(false);
    apiJson<Asset>(`/assets/${id}`)
      .then(setAsset)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Foto konnte nicht geladen werden"));
    apiJson<UserLabel[]>(`/assets/${id}/labels`).then(setAssignedLabels).catch(() => {});
    apiJson<UserLabel[]>("/user-labels").then(setAllLabels).catch(() => {});
  }, [id]);

  async function assignLabel(labelId: string) {
    if (!id) return;
    await apiJson(`/assets/${id}/labels`, { method: "POST", body: JSON.stringify({ labelId }) }).catch(() => {});
    const updated = await apiJson<UserLabel[]>(`/assets/${id}/labels`);
    setAssignedLabels(updated);
  }

  async function removeLabel(labelId: string) {
    if (!id) return;
    await apiJson(`/assets/${id}/labels/${labelId}`, { method: "DELETE" }).catch(() => {});
    setAssignedLabels((prev) => prev.filter((l) => l.id !== labelId));
  }

  /** Back to wherever the viewer was opened from - or the library if it was opened directly. */
  function close() {
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (historyIndex > 0) navigate(-1);
    else navigate("/", { replace: true });
  }

  async function runAction(kind: Exclude<Busy, null>, action: () => Promise<void>, failMessage: string) {
    setBusy(kind);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof ApiError ? `${failMessage}: ${err.message}` : failMessage);
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <div className="viewer">
        <div className="viewer-toolbar">
          <button className="btn secondary" onClick={close}>
            Schließen
          </button>
        </div>
        <p className="error-text" style={{ padding: 16 }}>
          {loadError}
        </p>
      </div>
    );
  }
  if (!id || !asset) return <p>Lädt…</p>;

  const isVideo = isVideoAsset(asset);
  const isTrashed = !!asset.deletedAt;
  const isLivePhoto = !isVideo && !asset.is360 && !!asset.livePhotoVideoId;
  // Version parameter so an edit/revert shows up immediately instead of the cached old file.
  const version = asset.size != null ? `?v=${asset.size}` : "";
  const fileUrl = imageUrl(`/assets/${id}/file${version}`);
  const previewUrl = imageUrl(`/assets/${id}/preview${version}`);
  // HEIC (iPhone default), TIFF, RAW, ... can't be rendered by most browsers:
  // show the server-generated JPEG preview; the original stays downloadable.
  const imageSrc = canBrowserDisplayOriginal(asset) ? fileUrl : previewUrl;

  const toggleArchive = () =>
    runAction(
      "archive",
      async () => setAsset(await setArchived(asset.id, !asset.isArchived)),
      asset.isArchived ? "Konnte nicht aus dem Archiv geholt werden" : "Archivieren fehlgeschlagen",
    );

  const trash = () =>
    runAction(
      "trash",
      async () => {
        await moveToTrash(asset.id);
        close();
      },
      "Verschieben in den Papierkorb fehlgeschlagen",
    );

  const restore = () =>
    runAction(
      "restore",
      async () => {
        await restoreFromTrash(asset.id);
        setAsset({ ...asset, deletedAt: null });
      },
      "Wiederherstellen fehlgeschlagen",
    );

  const deleteForever = () =>
    runAction(
      "delete",
      async () => {
        await deletePermanently(asset.id);
        setConfirmDelete(false);
        close();
      },
      "Endgültiges Löschen fehlgeschlagen",
    );

  return (
    <div className="viewer">
      <div className="viewer-toolbar">
        <button className="btn secondary" onClick={close}>
          Schließen
        </button>
        <a className="btn secondary" href={fileUrl} download={asset.filename}>
          Original herunterladen
        </a>
        <span style={{ flex: 1 }} />
        {isTrashed ? (
          <>
            <button className="btn secondary" onClick={() => void restore()} disabled={busy !== null}>
              {busy === "restore" ? "Stellt wieder her…" : "Wiederherstellen"}
            </button>
            <button className="btn danger" onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
              Endgültig löschen
            </button>
          </>
        ) : (
          <>
            {!isVideo && (
              <button className="btn secondary" onClick={() => setEditing(true)} disabled={busy !== null}>
                Bearbeiten
              </button>
            )}
            <button className="btn secondary" onClick={() => void toggleArchive()} disabled={busy !== null}>
              {asset.isArchived ? "Aus Archiv holen" : "Archivieren"}
            </button>
            <button
              className="btn danger"
              onClick={() => void trash()}
              disabled={busy !== null}
              title={`Kann ${TRASH_RETENTION_DAYS} Tage lang aus dem Papierkorb wiederhergestellt werden`}
            >
              {busy === "trash" ? "Wird verschoben…" : "In den Papierkorb"}
            </button>
          </>
        )}
      </div>

      {(isTrashed || asset.isArchived || actionError) && (
        <div className="viewer-banner">
          {actionError ? (
            <span className="error-text">{actionError}</span>
          ) : isTrashed ? (
            `Dieses Foto liegt im Papierkorb und wird ${TRASH_RETENTION_DAYS} Tage nach dem Löschen automatisch endgültig entfernt.`
          ) : (
            "Archiviert – dieses Foto ist in der Mediathek ausgeblendet."
          )}
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
        }}
        onMouseEnter={isLivePhoto ? () => setLivePlaying(true) : undefined}
        onMouseLeave={isLivePhoto ? () => setLivePlaying(false) : undefined}
        onTouchStart={isLivePhoto ? () => setLivePlaying(true) : undefined}
        onTouchEnd={isLivePhoto ? () => setLivePlaying(false) : undefined}
      >
        {!isVideo && !asset.is360 && isRawAsset(asset) && <span className="raw-badge">RAW</span>}
        {isLivePhoto && <span className="live-photo-badge">LIVE</span>}

        {isVideo && !videoFailed ? (
          <video
            src={fileUrl}
            poster={previewUrl}
            controls
            onError={() => setVideoFailed(true)}
            style={{ maxHeight: "100%", maxWidth: "100%" }}
          />
        ) : isVideo ? (
          <div style={{ textAlign: "center", color: "white" }}>
            <img src={previewUrl} alt={asset.filename} style={{ maxHeight: "60vh", maxWidth: "100%" }} />
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
              Dieses Video-Format kann dein Browser nicht abspielen – bitte das Original herunterladen.
            </p>
          </div>
        ) : asset.is360 ? (
          <Suspense fallback={<p style={{ color: "white" }}>Lädt 360°-Ansicht…</p>}>
            <PanoramaViewer src={imageSrc} />
          </Suspense>
        ) : isLivePhoto && livePlaying ? (
          <video
            src={imageUrl(`/assets/${asset.livePhotoVideoId}/file`)}
            autoPlay
            loop
            muted
            playsInline
            style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }}
          />
        ) : (
          <img
            src={imageSrc}
            alt={asset.filename}
            style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }}
          />
        )}
      </div>
      <div style={{ color: "white", padding: 16, fontSize: 13 }}>
        <div>
          {asset.filename} · {asset.takenAt ? new Date(asset.takenAt).toLocaleString("de-DE") : "Unbekanntes Datum"}
          {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
        </div>
        {formatExif(asset) && (
          <div style={{ color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{formatExif(asset)}</div>
        )}
        {asset.ocrText && asset.ocrText.trim() && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", color: "rgba(255,255,255,0.7)", userSelect: "none" }}>
              Erkannter Text
            </summary>
            <pre
              style={{
                marginTop: 6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "rgba(255,255,255,0.85)",
                background: "rgba(255,255,255,0.08)",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 12,
                fontFamily: "inherit",
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {asset.ocrText.trim()}
            </pre>
          </details>
        )}

        {/* User Labels */}
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {assignedLabels.map((l) => (
              <span
                key={l.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: l.color ?? "rgba(255,255,255,0.15)",
                  color: "white",
                  borderRadius: 12,
                  padding: "2px 8px",
                  fontSize: 12,
                }}
              >
                {l.name}
                <button
                  onClick={() => void removeLabel(l.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, lineHeight: 1 }}
                  title="Label entfernen"
                >
                  ×
                </button>
              </span>
            ))}
            {allLabels.length > 0 && (
              <button
                className="btn secondary"
                style={{ fontSize: 11, padding: "2px 8px" }}
                onClick={() => setShowLabelPicker((v) => !v)}
              >
                + Label
              </button>
            )}
          </div>
          {showLabelPicker && (
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {allLabels
                .filter((l) => !assignedLabels.some((a) => a.id === l.id))
                .map((l) => (
                  <button
                    key={l.id}
                    className="btn secondary"
                    style={{ fontSize: 11, padding: "2px 8px", borderLeft: l.color ? `3px solid ${l.color}` : undefined }}
                    onClick={() => { void assignLabel(l.id); setShowLabelPicker(false); }}
                  >
                    {l.name}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <PhotoEditor
          asset={asset}
          onClose={() => setEditing(false)}
          // The edit endpoints return the bare asset row; keep the extra
          // fields (tags, faces) from the initial detail request.
          onChanged={(updated) => setAsset((prev) => (prev ? { ...prev, ...updated } : updated))}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Endgültig löschen?"
          confirmLabel="Endgültig löschen"
          danger
          busy={busy === "delete"}
          onConfirm={() => void deleteForever()}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>
            „{asset.filename}“ wird unwiderruflich vom Server gelöscht – inklusive Original und aller Bearbeitungen.
            Das kann nicht rückgängig gemacht werden.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

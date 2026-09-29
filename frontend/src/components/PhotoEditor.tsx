import { useEffect, useMemo, useState } from "react";
import ReactCrop, { centerCrop, makeAspectCrop, type PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { ApiError } from "../api/client";
import { imageUrl } from "../api/apiKey";
import { editAsset, revertAsset } from "../api/assets";
import { canBrowserDisplayOriginal } from "../api/media";
import type { Asset, EditOperations } from "../api/types";
import { clearAppliedEdit, loadAppliedEdit, saveAppliedEdit } from "../editor/editHistory";
import { composeEdit, normalizeRotation, previewFilter, type Rotation } from "../editor/editMath";

/** Longest side of the in-browser working copy - plenty for on-screen cropping. */
const WORKING_MAX_SIDE = 2048;

const ASPECTS: { label: string; value: number | undefined }[] = [
  { label: "Frei", value: undefined },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
];

interface LoadedImage {
  element: HTMLImageElement;
  /** Real pixel size of the current file (upright). */
  realWidth: number;
  realHeight: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
    img.src = src;
  });
}

/** Rotated, downscaled working copy as an object URL (browsers apply EXIF orientation when drawing). */
function renderRotated(img: HTMLImageElement, rotation: Rotation): Promise<{ url: string; width: number; height: number }> {
  const scale = Math.min(1, WORKING_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const quarter = rotation === 90 || rotation === 270;
  const canvas = document.createElement("canvas");
  canvas.width = quarter ? h : w;
  canvas.height = quarter ? w : h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas nicht verfügbar"));
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve({ url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height })
          : reject(new Error("Vorschau konnte nicht erzeugt werden")),
      "image/jpeg",
      0.92,
    ),
  );
}

interface PhotoEditorProps {
  asset: Asset;
  onClose: () => void;
  /** Called with the updated asset after a successful save or revert. */
  onChanged: (asset: Asset) => void;
}

export function PhotoEditor({ asset, onClose, onChanged }: PhotoEditorProps) {
  const previous = useMemo(() => loadAppliedEdit(asset), [asset]);

  const [image, setImage] = useState<LoadedImage | null>(null);
  const [working, setWorking] = useState<{ url: string; width: number; height: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [extraRotation, setExtraRotation] = useState<Rotation>(0);
  const [crop, setCrop] = useState<PercentCrop | undefined>(undefined);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [brightness, setBrightness] = useState(previous?.brightness ?? 0);
  const [contrast, setContrast] = useState(previous?.contrast ?? 0);

  const [busy, setBusy] = useState<"save" | "revert" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Reset the controls whenever the underlying file changes (e.g. after "Original wiederherstellen").
  useEffect(() => {
    setExtraRotation(0);
    setCrop(undefined);
    setBrightness(previous?.brightness ?? 0);
    setContrast(previous?.contrast ?? 0);
  }, [previous, asset.size]);

  // Load the current file. HEIC/TIFF/RAW go through the server's JPEG preview,
  // scaled back up to real pixels via the known asset dimensions.
  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setLoadError(null);
    const direct = canBrowserDisplayOriginal(asset);
    const version = asset.size != null ? `?v=${asset.size}` : "";
    const src = imageUrl(`/assets/${asset.id}/${direct ? "file" : "preview"}${version}`);
    loadImage(src)
      .then((element) => {
        if (cancelled) return;
        let scale = 1;
        if (!direct && asset.width && asset.height) {
          scale = Math.max(asset.width, asset.height) / Math.max(element.naturalWidth, element.naturalHeight);
        }
        setImage({
          element,
          realWidth: Math.round(element.naturalWidth * scale),
          realHeight: Math.round(element.naturalHeight * scale),
        });
      })
      .catch((err: Error) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [asset]);

  // (Re)build the rotated working copy.
  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    renderRotated(image.element, extraRotation)
      .then((result) => {
        if (cancelled) URL.revokeObjectURL(result.url);
        else setWorking(result);
      })
      .catch((err: Error) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [image, extraRotation]);

  // Free each working copy once it's replaced (or the editor closes) - not
  // earlier, so the old one stays visible while the next one renders.
  useEffect(() => {
    return () => {
      if (working) URL.revokeObjectURL(working.url);
    };
  }, [working]);

  function rotate(delta: 90 | -90) {
    setExtraRotation((r) => normalizeRotation(r + delta));
    // A crop drawn on the old orientation wouldn't map sensibly onto the new one.
    setCrop(undefined);
  }

  function chooseAspect(value: number | undefined) {
    setAspect(value);
    if (value && working) {
      setCrop(centerCrop(makeAspectCrop({ unit: "%", width: 90 }, value, working.width, working.height), working.width, working.height));
    }
  }

  const hasCrop = !!crop && crop.width > 0 && crop.height > 0;
  const isDirty =
    extraRotation !== 0 ||
    hasCrop ||
    brightness !== (previous?.brightness ?? 0) ||
    contrast !== (previous?.contrast ?? 0);

  async function save() {
    if (!image) return;
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const composed = composeEdit({
        previous,
        extraRotation,
        cropPercent: hasCrop ? crop : null,
        currentWidth: image.realWidth,
        currentHeight: image.realHeight,
      });
      const ops: EditOperations = {};
      if (composed.rotate !== 0) ops.rotate = composed.rotate;
      if (composed.crop) ops.crop = composed.crop;
      if (brightness !== 0) ops.brightness = brightness;
      if (contrast !== 0) ops.contrast = contrast;

      let updated: Asset;
      if (Object.keys(ops).length === 0) {
        // Everything back to neutral - that's just the original again.
        if (!previous) {
          onClose();
          return;
        }
        updated = await revertAsset(asset.id);
        clearAppliedEdit(asset.id);
      } else {
        updated = await editAsset(asset.id, ops);
        saveAppliedEdit(
          asset.id,
          { rotate: composed.rotate, crop: composed.crop, brightness, contrast },
          updated,
        );
      }
      onChanged(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? `Speichern fehlgeschlagen: ${err.message}` : "Speichern fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  }

  async function revert() {
    setBusy("revert");
    setError(null);
    setNotice(null);
    try {
      const updated = await revertAsset(asset.id);
      clearAppliedEdit(asset.id);
      onChanged(updated);
      setNotice("Original wiederhergestellt.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setNotice("Dieses Foto wurde noch nicht bearbeitet – es ist bereits das Original.");
      } else {
        setError(err instanceof ApiError ? `Wiederherstellen fehlgeschlagen: ${err.message}` : "Wiederherstellen fehlgeschlagen");
      }
    } finally {
      setBusy(null);
    }
  }

  const filter = previewFilter(brightness, contrast, previous);

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <button className="btn secondary" onClick={onClose} disabled={busy !== null}>
          Abbrechen
        </button>
        <strong style={{ color: "white", flex: 1, textAlign: "center" }}>Bearbeiten</strong>
        <button className="btn" onClick={() => void save()} disabled={!image || busy !== null || !isDirty}>
          {busy === "save" ? "Speichert…" : "Speichern"}
        </button>
      </div>

      <div className="editor-stage">
        {loadError && <p className="error-text">{loadError}</p>}
        {!loadError && !working && <p style={{ color: "white" }}>Lädt…</p>}
        {working && (
          <ReactCrop
            crop={crop}
            aspect={aspect}
            onChange={(_, percent) => setCrop(percent)}
            ruleOfThirds
            className="editor-crop"
          >
            <img src={working.url} alt={asset.filename} className="editor-image" style={{ filter }} />
          </ReactCrop>
        )}
      </div>

      <div className="editor-panel">
        {(error || notice) && (
          <p className={error ? "error-text" : "editor-notice"} style={{ margin: 0 }}>
            {error ?? notice}
          </p>
        )}

        <div className="editor-row">
          <span className="editor-label">Drehen</span>
          <button className="btn secondary" onClick={() => rotate(-90)} disabled={busy !== null} title="90° nach links">
            ⟲ Links
          </button>
          <button className="btn secondary" onClick={() => rotate(90)} disabled={busy !== null} title="90° nach rechts">
            ⟳ Rechts
          </button>
        </div>

        <div className="editor-row">
          <span className="editor-label">Zuschneiden</span>
          {ASPECTS.map((option) => (
            <button
              key={option.label}
              className={aspect === option.value ? "btn" : "btn secondary"}
              onClick={() => chooseAspect(option.value)}
              disabled={busy !== null}
            >
              {option.label}
            </button>
          ))}
          {hasCrop && (
            <button className="btn secondary" onClick={() => setCrop(undefined)} disabled={busy !== null}>
              Zuschnitt entfernen
            </button>
          )}
          {!hasCrop && <span className="editor-hint">Rahmen im Bild aufziehen</span>}
        </div>

        <label className="editor-row">
          <span className="editor-label">Helligkeit</span>
          <input
            type="range"
            min={-100}
            max={100}
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
            onDoubleClick={() => setBrightness(0)}
            disabled={busy !== null}
          />
          <span className="editor-value">{brightness > 0 ? `+${brightness}` : brightness}</span>
        </label>

        <label className="editor-row">
          <span className="editor-label">Kontrast</span>
          <input
            type="range"
            min={-100}
            max={100}
            value={contrast}
            onChange={(e) => setContrast(Number(e.target.value))}
            onDoubleClick={() => setContrast(0)}
            disabled={busy !== null}
          />
          <span className="editor-value">{contrast > 0 ? `+${contrast}` : contrast}</span>
        </label>

        <div className="editor-row" style={{ justifyContent: "space-between" }}>
          <span className="editor-hint">
            {previous
              ? "Bereits bearbeitet – Änderungen bauen auf der letzten Bearbeitung auf."
              : "Bearbeitungen sind nicht-destruktiv, das Original bleibt erhalten."}
          </span>
          <button className="btn secondary" onClick={() => void revert()} disabled={busy !== null}>
            {busy === "revert" ? "Stellt wieder her…" : "Original wiederherstellen"}
          </button>
        </div>
      </div>
    </div>
  );
}

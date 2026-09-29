import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { Asset } from "../api/types";
import { stillImageUrl } from "../api/media";

// three.js is a sizeable dependency (see PanoramaViewer) - code-split it so
// browsing/uploading photos never has to download it, only actually opening
// a 360° photo (here, or in the viewer) does.
const PanoramaViewer = lazy(() => import("./PanoramaViewer").then((m) => ({ default: m.PanoramaViewer })));

const INTERVALS = [3, 4, 5, 8, 15] as const;

interface SlideshowProps {
  assets: Asset[];
  startIndex?: number;
  onClose: () => void;
}

/**
 * Vollbild-Diashow mit automatischem Weiterschalten - aus der Mediathek oder
 * einem Album gestartet, zeigt genau die dort bereits geladenen Fotos (siehe
 * Einschränkung dazu im Test-Log/Bericht: nicht die ganze Bibliothek, falls
 * noch nicht alles nachgeladen wurde). Videos werden als Standbild gezeigt
 * (kein Ton/Abspielen in der Diashow), 360°-Fotos bekommen den echten
 * Panorama-Viewer statt eines flachen Bilds.
 */
export function Slideshow({ assets, startIndex = 0, onClose }: SlideshowProps) {
  const [index, setIndex] = useState(startIndex);
  const [playing, setPlaying] = useState(true);
  const [seconds, setSeconds] = useState<number>(4);
  const count = assets.length;

  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count]);
  const prev = useCallback(() => setIndex((i) => (i - 1 + count) % count), [count]);
  const goto = useCallback(
    (fn: () => void) => {
      setPlaying(false);
      fn();
    },
    [],
  );

  useEffect(() => {
    if (!playing || count <= 1) return;
    const timer = setInterval(next, seconds * 1000);
    return () => clearInterval(timer);
  }, [playing, seconds, next, count]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") goto(next);
      else if (e.key === "ArrowLeft") goto(prev);
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, prev, goto, onClose]);

  if (count === 0) return null;
  const asset = assets[index];

  return (
    <div className="slideshow">
      <div className="slideshow-toolbar">
        <strong>Diashow</strong>
        <span style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          Tempo
          <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
            {INTERVALS.map((s) => (
              <option key={s} value={s}>
                {s}s
              </option>
            ))}
          </select>
        </label>
        <button className="btn secondary" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Abspielen"}
        </button>
        <button className="btn secondary" onClick={onClose}>
          Beenden
        </button>
      </div>

      <div className="slideshow-stage">
        {count > 1 && (
          <button className="slideshow-nav prev" onClick={() => goto(prev)} aria-label="Vorheriges Foto">
            ‹
          </button>
        )}
        {asset.is360 ? (
          <Suspense fallback={<p style={{ color: "white" }}>Lädt 360°-Ansicht…</p>}>
            <PanoramaViewer key={asset.id} src={stillImageUrl(asset)} />
          </Suspense>
        ) : (
          <img key={asset.id} src={stillImageUrl(asset)} alt={asset.filename} />
        )}
        {count > 1 && (
          <button className="slideshow-nav next" onClick={() => goto(next)} aria-label="Nächstes Foto">
            ›
          </button>
        )}
      </div>

      <div className="slideshow-counter">
        {index + 1} / {count} · {asset.filename}
      </div>
    </div>
  );
}

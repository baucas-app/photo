import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { imageUrl } from "../api/apiKey";
import type { Asset } from "../api/types";

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

export function ViewerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<Asset | null>(null);

  useEffect(() => {
    if (!id) return;
    apiJson<Asset>(`/assets/${id}`).then(setAsset);
  }, [id]);

  if (!id || !asset) return <p>Lädt…</p>;

  const isVideo = asset.mimeType?.startsWith("video/");

  return (
    <div style={{ background: "black", position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 16 }}>
        <button className="btn secondary" onClick={() => navigate(-1)}>
          Schließen
        </button>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {isVideo ? (
          <video src={imageUrl(`/assets/${id}/file`)} controls style={{ maxHeight: "100%", maxWidth: "100%" }} />
        ) : (
          <img
            src={imageUrl(`/assets/${id}/file`)}
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
      </div>
    </div>
  );
}

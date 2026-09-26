import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiJson } from "../api/client";
import { imageUrl } from "../api/apiKey";
import type { Face } from "../api/types";

export function FacesPage() {
  const [faces, setFaces] = useState<Face[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    apiJson<Face[]>("/faces").then(setFaces);
  }, []);

  return (
    <div>
      <h2>Personen</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 16 }}>
        {faces.map((face) => (
          <div
            key={face.id}
            style={{ textAlign: "center", cursor: "pointer" }}
            onClick={() => navigate(`/faces/${face.id}`)}
          >
            <div
              style={{
                width: 100,
                height: 100,
                borderRadius: "50%",
                overflow: "hidden",
                margin: "0 auto 8px",
                background: "var(--color-surface)",
              }}
            >
              {face.sampleAsset && (
                <img
                  src={imageUrl(`/assets/${face.sampleAsset.id}/thumbnail`)}
                  alt={face.personName ?? "Person"}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              )}
            </div>
            <div style={{ fontSize: 13 }}>{face.personName ?? "Unbenannt"}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{face.assetCount} Fotos</div>
          </div>
        ))}
      </div>
      {faces.length === 0 && <p>Noch keine Gesichter erkannt.</p>}
    </div>
  );
}

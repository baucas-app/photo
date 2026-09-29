import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { fetchMapPoints } from "../api/assets";
import { imageUrl } from "../api/apiKey";
import type { MapPoint } from "../api/types";

/** Screen-space size of a cluster cell - points closer than this merge. */
const CLUSTER_CELL_PX = 64;
/** At/above this zoom, clusters open a thumbnail list instead of zooming further. */
const MAX_CLUSTER_ZOOM = 17;
const MAX_POPUP_THUMBNAILS = 12;

interface Cluster {
  key: string;
  center: L.LatLng;
  points: MapPoint[];
}

/**
 * Simple grid clustering: project every point to pixel space at the current
 * zoom and bucket by cell. Good enough for a personal library (thousands of
 * points) without pulling in leaflet.markercluster.
 */
function clusterPoints(map: L.Map, points: MapPoint[], zoom: number): Cluster[] {
  const cells = new Map<string, MapPoint[]>();
  for (const point of points) {
    const px = map.project([point.latitude, point.longitude], zoom);
    const key = `${Math.floor(px.x / CLUSTER_CELL_PX)}:${Math.floor(px.y / CLUSTER_CELL_PX)}`;
    const list = cells.get(key);
    if (list) list.push(point);
    else cells.set(key, [point]);
  }
  return [...cells.entries()].map(([key, cellPoints]) => {
    const lat = cellPoints.reduce((sum, p) => sum + p.latitude, 0) / cellPoints.length;
    const lng = cellPoints.reduce((sum, p) => sum + p.longitude, 0) / cellPoints.length;
    return { key, center: L.latLng(lat, lng), points: cellPoints };
  });
}

// Leaflet's default PNG marker icons don't survive bundling (broken image
// paths), so every pin is a styled divIcon showing the photo itself.
function photoIcon(point: MapPoint, count: number): L.DivIcon {
  // Goes into an inline style url('...') - keep quotes from breaking out of it.
  const thumb = imageUrl(`/assets/${point.id}/thumbnail`).replace(/['"()\\]/g, encodeURIComponent);
  const badge = count > 1 ? `<span class="map-pin-count">${count}</span>` : "";
  return L.divIcon({
    className: "map-pin",
    html: `<div class="map-pin-photo" style="background-image:url('${thumb}')"></div>${badge}`,
    iconSize: [48, 48],
    iconAnchor: [24, 48],
    popupAnchor: [0, -48],
  });
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }) : "Unbekanntes Datum";
}

function ClusteredMarkers({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const clusters = useMemo(() => clusterPoints(map, points, zoom), [map, points, zoom]);

  return (
    <>
      {clusters.map((cluster) => {
        const cover = cluster.points[0]!;
        const isSingle = cluster.points.length === 1;
        const samePlace = cluster.points.every(
          (p) => p.latitude === cover.latitude && p.longitude === cover.longitude,
        );
        // Clusters zoom in on click until that can't separate them any more.
        const zoomsIn = !isSingle && !samePlace && zoom < MAX_CLUSTER_ZOOM;
        return (
          <Marker
            key={`${zoom}-${cluster.key}`}
            position={cluster.center}
            icon={photoIcon(cover, cluster.points.length)}
            eventHandlers={
              zoomsIn
                ? {
                    click: () =>
                      map.fitBounds(
                        L.latLngBounds(cluster.points.map((p) => [p.latitude, p.longitude] as [number, number])),
                        { padding: [60, 60], maxZoom: MAX_CLUSTER_ZOOM },
                      ),
                  }
                : undefined
            }
          >
            {!zoomsIn && (
              <Popup minWidth={isSingle ? 200 : 240} maxWidth={320}>
                {isSingle ? (
                  <button className="map-popup-single" onClick={() => navigate(`/viewer/${cover.id}`)}>
                    <img src={imageUrl(`/assets/${cover.id}/thumbnail`)} alt="" />
                    <span>{formatDate(cover.takenAt)}</span>
                    <span className="map-popup-hint">Klicken zum Öffnen</span>
                  </button>
                ) : (
                  <div>
                    <div className="map-popup-title">{cluster.points.length} Fotos an diesem Ort</div>
                    <div className="map-popup-grid">
                      {cluster.points.slice(0, MAX_POPUP_THUMBNAILS).map((p) => (
                        <button key={p.id} onClick={() => navigate(`/viewer/${p.id}`)} title={formatDate(p.takenAt)}>
                          <img src={imageUrl(`/assets/${p.id}/thumbnail`)} alt="" loading="lazy" />
                        </button>
                      ))}
                    </div>
                    {cluster.points.length > MAX_POPUP_THUMBNAILS && (
                      <div className="map-popup-hint">
                        + {cluster.points.length - MAX_POPUP_THUMBNAILS} weitere
                      </div>
                    )}
                  </div>
                )}
              </Popup>
            )}
          </Marker>
        );
      })}
    </>
  );
}

/** Frames all points once they're loaded. */
function FitToPoints({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number])), {
      padding: [60, 60],
      maxZoom: 14,
    });
  }, [map, points]);
  return null;
}

export function MapPage() {
  const [points, setPoints] = useState<MapPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMapPoints()
      .then(setPoints)
      .catch(() => setError("Kartendaten konnten nicht geladen werden."));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <h2>Karte</h2>
        {points && points.length > 0 && (
          <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
            {points.length} {points.length === 1 ? "Foto" : "Fotos"} mit Standort
          </span>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="map-wrapper">
        <MapContainer center={[51.1657, 10.4515]} zoom={5} minZoom={2} worldCopyJump style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {points && <ClusteredMarkers points={points} />}
          {points && <FitToPoints points={points} />}
        </MapContainer>
        {points && points.length === 0 && (
          <div className="map-empty">
            <strong>Noch keine Fotos mit Standort</strong>
            <span>Fotos erscheinen hier, sobald sie GPS-Koordinaten in den EXIF-Daten enthalten.</span>
          </div>
        )}
        {!points && !error && <div className="map-empty">Lädt…</div>}
      </div>
    </div>
  );
}

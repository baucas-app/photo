import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiJson } from "../api/client";
import type { Asset, Trip } from "../api/types";

const API = import.meta.env.VITE_API_URL ?? "";

interface TripDetail {
  trip: Trip;
  assets: Asset[];
  nextCursor: string | null;
}

interface DawarichPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
}

export function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [track, setTrack] = useState<DawarichPoint[] | null>(null);

  useEffect(() => {
    if (!id) return;
    apiJson<TripDetail>(`/trips/${id}`).then((d) => {
      setTrip(d.trip);
      setAssets(d.assets);
      setNextCursor(d.nextCursor);
      setEditName(d.trip.name);
    });
    // Try to load Dawarich GPS track (fails silently if not configured)
    apiJson<DawarichPoint[]>(`/trips/dawarich/track?tripId=${id}`)
      .then(setTrack)
      .catch(() => {});
  }, [id]);

  async function loadMore() {
    if (!nextCursor || !id) return;
    setLoadingMore(true);
    const d = await apiJson<TripDetail>(`/trips/${id}?cursor=${nextCursor}`);
    setAssets((prev) => [...prev, ...d.assets]);
    setNextCursor(d.nextCursor);
    setLoadingMore(false);
  }

  async function saveName() {
    if (!trip) return;
    const updated = await apiJson<Trip>(`/trips/${trip.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: editName }),
    });
    setTrip(updated);
    setEditing(false);
  }

  if (!trip) return <div className="page-center">Lade…</div>;

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div style={{ padding: "24px 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Link to="/trips" style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          ← Reisen
        </Link>
      </div>

      {editing ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            style={{
              fontSize: 22,
              fontWeight: 700,
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              padding: "4px 8px",
              flex: 1,
            }}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            autoFocus
          />
          <button className="btn" onClick={saveName}>Speichern</button>
          <button className="btn secondary" onClick={() => setEditing(false)}>Abbrechen</button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{trip.name}</h1>
          <button
            style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5, fontSize: 14 }}
            onClick={() => setEditing(true)}
            title="Umbenennen"
          >
            ✏️
          </button>
        </div>
      )}

      <div style={{ color: "var(--color-text-muted)", fontSize: 13.5, marginBottom: 20 }}>
        {fmt(trip.startDate)} – {fmt(trip.endDate)} · {trip._count.assets} Fotos
        {trip.locationName ? ` · ${trip.locationName}` : ""}
      </div>

      {/* Map (shown only when GPS track or center is available) */}
      {(track || (trip.centerLat && trip.centerLon)) && (
        <TripMap trip={trip} track={track} />
      )}

      {/* Photo grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 4,
          marginTop: 20,
        }}
      >
        {assets.map((asset) => (
          <Link key={asset.id} to={`/viewer/${asset.id}`}>
            <img
              src={`${API}/api/assets/${asset.id}/thumbnail`}
              alt=""
              style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }}
              loading="lazy"
            />
          </Link>
        ))}
      </div>

      {nextCursor && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button className="btn secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Lade…" : "Mehr laden"}
          </button>
        </div>
      )}
    </div>
  );
}

function TripMap({ trip, track }: { trip: Trip; track: DawarichPoint[] | null }) {
  const center = trip.centerLat && trip.centerLon
    ? [trip.centerLat, trip.centerLon]
    : null;

  if (!center) return null;

  const osmUrl = `https://www.openstreetmap.org/?mlat=${center[0]}&mlon=${center[1]}#map=8/${center[0]}/${center[1]}`;

  // Build a static map tile preview (no JS library needed for the list view).
  const lat = center[0]!;
  const lon = center[1]!;
  return (
    <div
      style={{
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid var(--color-border)",
        position: "relative",
        height: 180,
        background: "var(--color-surface-2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
      }}
    >
      <a
        href={osmUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          textDecoration: "none",
          color: "var(--color-text-muted)",
          fontSize: 13,
        }}
      >
        <span style={{ fontSize: 32 }}>🗺️</span>
        <span>
          {lat.toFixed(4)}°, {lon.toFixed(4)}°
          {track ? ` · ${track.length} GPS-Punkte aus Dawarich` : ""}
        </span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>In OpenStreetMap öffnen ↗</span>
      </a>
    </div>
  );
}

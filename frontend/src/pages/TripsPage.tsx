import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api/client";
import type { Trip } from "../api/types";

const API = import.meta.env.VITE_API_URL ?? "";

function formatDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) =>
    d.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
  if (s.toDateString() === e.toDateString()) return fmt(s);
  return `${fmt(s)} – ${fmt(e)}`;
}

export function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    apiJson<Trip[]>("/trips")
      .then(setTrips)
      .finally(() => setLoading(false));
  }, []);

  async function recalculate() {
    setRecalculating(true);
    try {
      const { trips: count } = await apiJson<{ trips: number }>("/trips/recalculate", {
        method: "POST",
      });
      const updated = await apiJson<Trip[]>("/trips");
      setTrips(updated);
      if (count === 0) alert("Keine Reisen gefunden. Fotos mit GPS und Datum werden benötigt.");
    } finally {
      setRecalculating(false);
    }
  }

  if (loading) return <div className="page-center">Lade Reisen…</div>;

  return (
    <div style={{ padding: "24px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Reisen</h1>
        <button
          className="btn"
          style={{ marginLeft: "auto", fontSize: 13 }}
          onClick={recalculate}
          disabled={recalculating}
        >
          {recalculating ? "Berechne…" : "Neu berechnen"}
        </button>
      </div>

      {trips.length === 0 ? (
        <div style={{ color: "var(--color-text-muted)", marginTop: 40, textAlign: "center" }}>
          <p>Noch keine Reisen. Klicke auf „Neu berechnen" um Fotos automatisch zu gruppieren.</p>
          <p style={{ fontSize: 13 }}>
            Voraussetzung: Fotos mit GPS-Koordinaten und Aufnahmedatum.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {trips.map((trip) => (
            <Link
              key={trip.id}
              to={`/trips/${trip.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <TripCard trip={trip} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const thumbUrl = trip.coverAssetId ? `${API}/api/assets/${trip.coverAssetId}/thumbnail` : null;

  return (
    <div
      style={{
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,.12)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.boxShadow = "")}
    >
      <div
        style={{
          height: 160,
          background: thumbUrl
            ? `url(${thumbUrl}) center/cover`
            : "var(--color-surface-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 40,
        }}
      >
        {!thumbUrl && "🗺️"}
      </div>
      <div style={{ padding: "12px 14px" }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{trip.name}</div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
          {formatDateRange(trip.startDate, trip.endDate)}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
          {trip._count.assets} Fotos
          {trip.locationName ? ` · ${trip.locationName}` : ""}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { apiJson, ApiError } from "../api/client";
import type { LibraryShare } from "../api/types";

interface PartnerData {
  sent: LibraryShare[];
  received: LibraryShare[];
}

export function PartnerPage() {
  const [data, setData] = useState<PartnerData>({ sent: [], received: [] });
  const [emailInput, setEmailInput] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = () =>
    apiJson<PartnerData>("/partner")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { void reload(); }, []);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);
    try {
      await apiJson("/partner/invite", {
        method: "POST",
        body: JSON.stringify({ email: emailInput }),
      });
      setEmailInput("");
      setInviteSuccess("Einladung gesendet.");
      void reload();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Einladung konnte nicht gesendet werden");
    }
  }

  async function onAccept() {
    try {
      await apiJson("/partner/accept", { method: "POST" });
      void reload();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Fehler beim Annehmen der Einladung");
    }
  }

  async function onRemove(shareId: string) {
    if (!confirm("Partner-Freigabe wirklich entfernen?")) return;
    try {
      await apiJson(`/partner/${shareId}`, { method: "DELETE" });
      void reload();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Fehler beim Entfernen der Freigabe");
    }
  }

  if (loading) return <p>Lädt…</p>;

  const pendingIncoming = data.received.filter((s) => s.status === "pending");
  const accepted = [
    ...data.sent.filter((s) => s.status === "accepted"),
    ...data.received.filter((s) => s.status === "accepted"),
  ];
  const pendingSent = data.sent.filter((s) => s.status === "pending");

  return (
    <div style={{ maxWidth: 560 }}>
      <h2>Partner-Freigabe</h2>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 24 }}>
        Teile deine gesamte Bibliothek gegenseitig mit einer anderen Person – z.B. einem Familienmitglied.
      </p>

      {pendingIncoming.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h3>Ausstehende Einladung</h3>
          {pendingIncoming.map((s) => (
            <div key={s.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
              <span>{s.fromUser?.name ?? s.fromUser?.email} möchte seine Bibliothek mit dir teilen.</span>
              <button className="btn" onClick={onAccept}>Annehmen</button>
              <button className="btn secondary" onClick={() => void onRemove(s.id)}>Ablehnen</button>
            </div>
          ))}
        </section>
      )}

      {accepted.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h3>Aktive Partner</h3>
          {accepted.map((s) => {
            const partner = s.fromUserId === s.toUserId
              ? null
              : s.toUser ?? s.fromUser;
            return (
              <div key={s.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                <span>{partner?.name ?? partner?.email}</span>
                <button className="btn secondary" onClick={() => void onRemove(s.id)}>Entfernen</button>
              </div>
            );
          })}
        </section>
      )}

      {pendingSent.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h3>Gesendete Einladungen</h3>
          {pendingSent.map((s) => (
            <div key={s.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
              <span>{s.toUser?.name ?? s.toUser?.email} – wartet auf Annahme</span>
              <button className="btn secondary" onClick={() => void onRemove(s.id)}>Zurückziehen</button>
            </div>
          ))}
        </section>
      )}

      {accepted.length === 0 && pendingSent.length === 0 && (
        <section>
          <h3>Einladung senden</h3>
          <form onSubmit={(e) => void onInvite(e)} style={{ display: "flex", gap: 8 }}>
            <input
              type="email"
              placeholder="E-Mail-Adresse"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              required
              style={{ flex: 1 }}
            />
            <button className="btn" type="submit">Einladen</button>
          </form>
          {inviteError && <p className="error-text">{inviteError}</p>}
          {inviteSuccess && <p style={{ color: "var(--color-success, green)" }}>{inviteSuccess}</p>}
        </section>
      )}
    </div>
  );
}

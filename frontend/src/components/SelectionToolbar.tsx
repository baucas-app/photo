interface SelectionToolbarProps {
  count: number;
  busy: boolean;
  error: string | null;
  onStack: () => void;
  onCancel: () => void;
}

/** Replaces the normal page toolbar while the multi-select mode for "Stapeln" is active. */
export function SelectionToolbar({ count, busy, error, onStack, onCancel }: SelectionToolbarProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <strong style={{ fontSize: 14 }}>{count} ausgewählt</strong>
      <button className="btn" onClick={onStack} disabled={count < 2 || busy}>
        {busy ? "Stapelt…" : "Stapeln"}
      </button>
      <button className="btn secondary" onClick={onCancel} disabled={busy}>
        Abbrechen
      </button>
      {count < 2 && <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Mindestens 2 Fotos wählen</span>}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

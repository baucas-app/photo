import { useEffect, type ReactNode } from "react";

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Minimal modal confirmation - used for irreversible actions. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "Abbrechen",
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  return (
    <div className="dialog-backdrop" onClick={() => !busy && onCancel()}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title">{title}</h3>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          <button className="btn secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className={danger ? "btn danger" : "btn"} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? "Bitte warten…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson, ApiError, apiFetch } from "../api/client";
import { useAssetUpload } from "../hooks/useAssetUpload";
import { useStacking } from "../hooks/useStacking";
import type { Album, AlbumComment, AlbumDetail, Asset } from "../api/types";
import { PhotoGrid } from "../components/PhotoGrid";
import { SelectionToolbar } from "../components/SelectionToolbar";
import { StackModal } from "../components/StackModal";
import { Slideshow } from "../components/Slideshow";

export function AlbumDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<Omit<AlbumDetail, "assets" | "nextCursor"> | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [allAlbums, setAllAlbums] = useState<Album[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [parentInput, setParentInput] = useState<string>("");
  const [manageError, setManageError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [lockPasswordInput, setLockPasswordInput] = useState("");
  const [lockError, setLockError] = useState<string | null>(null);
  const [comments, setComments] = useState<AlbumComment[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const { progress: uploadProgress, uploadFiles } = useAssetUpload(id);
  const stacking = useStacking(setAssets);

  const loadMore = useCallback(
    async (albumId: string, currentCursor: string | null, isDone: boolean) => {
      if (inFlightRef.current || isDone) return;
      inFlightRef.current = true;
      setLoading(true);
      setLoadError(null);
      try {
        const query = currentCursor ? `?cursor=${encodeURIComponent(currentCursor)}` : "";
        const page = await apiJson<AlbumDetail>(`/albums/${albumId}${query}`);
        if (!currentCursor) {
          // First page: set album metadata too
          const { assets: newAssets, nextCursor, ...meta } = page;
          setAlbum(meta);
          setNameInput(meta.name);
          setParentInput(meta.parentId ?? "");
          setAssets(newAssets);
          setCursor(nextCursor);
          if (!nextCursor) setDone(true);
        } else {
          // Subsequent pages: only append assets
          setAssets((prev) => {
            const seen = new Set(prev.map((a) => a.id));
            return [...prev, ...page.assets.filter((a) => !seen.has(a.id))];
          });
          setCursor(page.nextCursor);
          if (!page.nextCursor) setDone(true);
        }
      } catch (err) {
        if (!currentCursor) {
          setLoadError(err instanceof ApiError ? err.message : "Album konnte nicht geladen werden");
        } else {
          setLoadError("Weitere Fotos konnten nicht geladen werden.");
        }
      } finally {
        inFlightRef.current = false;
        setLoading(false);
      }
    },
    [],
  );

  // Full reset + initial load when album id changes
  useEffect(() => {
    if (!id) return;
    setAlbum(null);
    setAssets([]);
    setCursor(null);
    setDone(false);
    setLoadError(null);
    setShowManage(false);
    inFlightRef.current = false;
    void loadMore(id, null, false);

    apiJson<Album[]>("/albums")
      .then(setAllAlbums)
      .catch(() => {});

    apiJson<AlbumComment[]>(`/albums/${id}/comments`)
      .then(setComments)
      .catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !id) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore(id, cursor, done);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, id, cursor, done, loadError]);

  if (loadError && !album) return <p className="error-text">{loadError}</p>;
  if (!album) return <p>Lädt…</p>;

  // Lock screen: shown when album is locked and user hasn't unlocked it yet.
  if (album.isLocked && !unlocked) {
    async function submitUnlock(e: React.FormEvent) {
      e.preventDefault();
      if (!id) return;
      setLockError(null);
      try {
        await apiJson(`/albums/${id}/unlock`, {
          method: "POST",
          body: JSON.stringify({ password: lockPasswordInput }),
        });
        setUnlocked(true);
      } catch {
        setLockError("Falsches Passwort");
      }
    }
    return (
      <div style={{ maxWidth: 360, margin: "80px auto", textAlign: "center" }}>
        <p style={{ fontSize: 32, marginBottom: 8 }}>🔒</p>
        <h2 style={{ marginBottom: 4 }}>{album.name}</h2>
        <p style={{ color: "var(--color-text-muted)", marginBottom: 24 }}>Dieses Album ist gesperrt.</p>
        <form onSubmit={(e) => void submitUnlock(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="password"
            autoFocus
            placeholder="Passwort"
            value={lockPasswordInput}
            onChange={(e) => setLockPasswordInput(e.target.value)}
            required
          />
          {lockError && <p className="error-text" style={{ margin: 0 }}>{lockError}</p>}
          <button className="btn" type="submit" disabled={!lockPasswordInput}>
            Entsperren
          </button>
        </form>
        <p style={{ marginTop: 16 }}>
          <Link to="/albums">← Zurück zu Alben</Link>
        </p>
      </div>
    );
  }

  /** The album itself and everything below it - invalid as a new parent. */
  const excludedParentIds = new Set<string>([album.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of allAlbums) {
      if (a.parentId && excludedParentIds.has(a.parentId) && !excludedParentIds.has(a.id)) {
        excludedParentIds.add(a.id);
        grew = true;
      }
    }
  }

  function prependAssets(uploaded: Asset[]) {
    setAssets((prev) => [...uploaded, ...prev]);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files, prependAssets);
  }

  async function onSaveManage(e: FormEvent) {
    e.preventDefault();
    if (!id || !album) return;
    setManageError(null);
    try {
      const updated = await apiJson<Album>(`/albums/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name: nameInput, parentId: parentInput || null }),
      });
      setShowManage(false);
      if (updated.path !== album.path) {
        navigate(0);
      } else {
        setAlbum((prev) => (prev ? { ...prev, name: updated.name } : prev));
      }
    } catch (err) {
      setManageError(err instanceof ApiError ? err.message : "Konnte Album nicht aktualisieren");
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={onDrop}
      style={{
        outline: isDraggingOver ? "2px dashed var(--color-accent)" : "none",
        outlineOffset: -8,
        borderRadius: 8,
        minHeight: "100%",
      }}
    >
      <p>
        <Link to="/albums">← Alben</Link>
      </p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>{album.name}</h2>
        {stacking.selectionMode ? (
          <SelectionToolbar
            count={stacking.selectedIds.size}
            busy={stacking.busy}
            error={stacking.error}
            onStack={() => void stacking.stackSelected()}
            onCancel={stacking.exitSelection}
          />
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn secondary" onClick={stacking.enterSelection} disabled={assets.length < 2}>
              Auswählen
            </button>
            <button
              className="btn secondary"
              onClick={() => setShowSlideshow(true)}
              disabled={assets.length === 0}
            >
              Diashow
            </button>
            <button className="btn secondary" onClick={() => setShowManage((v) => !v)}>
              Verwalten
            </button>
            <button
              className="btn secondary"
              disabled={assets.length === 0 || downloading}
              onClick={async () => {
                if (!id) return;
                setDownloading(true);
                try {
                  const resp = await apiFetch(`/albums/${id}/download`);
                  if (!resp.ok) throw new Error("Download fehlgeschlagen");
                  const blob = await resp.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${album?.name ?? "album"}.zip`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  // silently ignore
                } finally {
                  setDownloading(false);
                }
              }}
            >
              {downloading ? "…" : "↓ ZIP"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              style={{ display: "none" }}
              onChange={(e) => e.target.files && uploadFiles(e.target.files, prependAssets)}
            />
            <button className="btn" onClick={() => fileInputRef.current?.click()}>
              Hochladen
            </button>
          </div>
        )}
      </div>
      {album.description && <p>{album.description}</p>}

      {showManage && (
        <form
          onSubmit={onSaveManage}
          style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0", flexWrap: "wrap" }}
        >
          <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Name" required />
          <select value={parentInput} onChange={(e) => setParentInput(e.target.value)}>
            <option value="">(kein übergeordnetes Album)</option>
            {allAlbums
              .filter((a) => !excludedParentIds.has(a.id))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.path}
                </option>
              ))}
          </select>
          <button className="btn" type="submit">
            Speichern
          </button>
          {manageError && <span className="error-text">{manageError}</span>}
        </form>
      )}

      {uploadProgress && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          Lade hoch: {uploadProgress.done} / {uploadProgress.total}
        </p>
      )}

      {album.children.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          {album.children.map((child) => (
            <Link key={child.id} to={`/albums/${child.id}`} className="btn secondary">
              {child.name}
            </Link>
          ))}
        </div>
      )}

      <PhotoGrid
        assets={assets}
        selectedIds={stacking.selectionMode ? stacking.selectedIds : undefined}
        onToggleSelect={stacking.toggleSelect}
        onOpenStack={(asset) => stacking.openStack(asset.id)}
      />
      {assets.length === 0 && !loading && !loadError && (
        <p>Dieses Album enthält noch keine Fotos. Zieh Dateien hierher oder lade welche hoch.</p>
      )}

      {!done && !loadError && <div ref={sentinelRef} style={{ height: 1 }} />}
      {loading && <p>Lädt…</p>}
      {loadError && (
        <p className="error-text">
          {loadError}{" "}
          <button className="btn secondary" onClick={() => id && void loadMore(id, cursor, done)}>
            Erneut versuchen
          </button>
        </p>
      )}

      {stacking.openStackId && (
        <StackModal
          assetId={stacking.openStackId}
          onClose={stacking.closeStack}
          onChanged={() => navigate(0)}
        />
      )}

      {showSlideshow && <Slideshow assets={assets} onClose={() => setShowSlideshow(false)} />}

      {/* Comments */}
      <section style={{ marginTop: 48, borderTop: "1px solid var(--color-border)", paddingTop: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Kommentare ({comments.length})</h3>
        {comments.map((c) => (
          <div key={c.id} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, marginRight: 8 }}>{c.user.name ?? c.user.email}</span>
              <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                {new Date(c.createdAt).toLocaleString("de")}
              </span>
              <p style={{ margin: "4px 0 0" }}>{c.body}</p>
            </div>
            <button
              className="btn secondary"
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={async () => {
                try {
                  await apiJson(`/albums/${id}/comments/${c.id}`, { method: "DELETE" });
                  setComments((prev) => prev.filter((x) => x.id !== c.id));
                } catch { /* silently ignore permission errors */ }
              }}
            >
              ×
            </button>
          </div>
        ))}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setCommentError(null);
            if (!id || !commentInput.trim()) return;
            try {
              const c = await apiJson<AlbumComment>(`/albums/${id}/comments`, {
                method: "POST",
                body: JSON.stringify({ body: commentInput.trim() }),
              });
              setComments((prev) => [...prev, c]);
              setCommentInput("");
            } catch (err) {
              setCommentError(err instanceof ApiError ? err.message : "Kommentar konnte nicht gepostet werden");
            }
          }}
          style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "flex-start" }}
        >
          <textarea
            rows={2}
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            placeholder="Kommentar schreiben…"
            style={{ flex: 1, resize: "vertical" }}
          />
          <button className="btn" type="submit" disabled={!commentInput.trim()}>
            Posten
          </button>
        </form>
        {commentError && <p className="error-text">{commentError}</p>}
      </section>
    </div>
  );
}

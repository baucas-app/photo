import { useState } from "react";
import { apiJson } from "../api/client";
import type { Asset } from "../api/types";

export interface UploadProgress {
  done: number;
  total: number;
}

/**
 * Shared upload logic for Timeline (no album) and AlbumDetail (fixed
 * album). Uploads sequentially rather than in parallel so a large batch
 * doesn't overwhelm the backend's upload endpoint or the NAS's disk I/O.
 */
export function useAssetUpload(albumId?: string) {
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  async function uploadFiles(files: FileList | File[], onUploaded: (assets: Asset[]) => void) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (list.length === 0) return;

    setProgress({ done: 0, total: list.length });
    const uploaded: Asset[] = [];

    for (const file of list) {
      const formData = new FormData();
      formData.append("file", file);
      if (albumId) formData.append("albumId", albumId);
      try {
        uploaded.push(await apiJson<Asset>("/assets", { method: "POST", body: formData }));
      } catch {
        // Skip files that fail (e.g. unsupported format) and keep uploading the rest.
      }
      setProgress((prev) => (prev ? { done: prev.done + 1, total: prev.total } : null));
    }

    onUploaded(uploaded);
    setProgress(null);
  }

  return { progress, uploadFiles };
}

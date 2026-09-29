import type { Response } from "express";
import { toAbsolutePath } from "../services/filesystem.service.js";
import { effectiveMimeType } from "./mediaType.js";

/**
 * The stored mimeType comes straight from the uploading client. Serving it
 * verbatim would let anyone upload e.g. text/html or image/svg+xml and have
 * it rendered inline on the app's own origin (stored XSS - reachable without
 * auth through public share links). Only plain raster images and videos are
 * served inline; everything else is forced to a download.
 */
function isSafeInlineType(mimeType: string | null): mimeType is string {
  if (!mimeType) return false;
  const type = mimeType.toLowerCase();
  if (type.startsWith("image/svg")) return false;
  return type.startsWith("image/") || type.startsWith("video/");
}

export function sendAssetFile(res: Response, asset: { path: string; mimeType: string | null; filename: string }): void {
  // Rows uploaded by the iOS app before upload types were normalized carry
  // application/octet-stream; derive the real type from the extension.
  const mimeType = effectiveMimeType(asset);
  if (isSafeInlineType(mimeType)) {
    res.sendFile(toAbsolutePath(asset.path), { headers: { "Content-Type": mimeType } });
    return;
  }

  res.attachment(asset.filename);
  res.sendFile(toAbsolutePath(asset.path), {
    headers: { "Content-Type": "application/octet-stream", "Content-Security-Policy": "sandbox" },
  });
}

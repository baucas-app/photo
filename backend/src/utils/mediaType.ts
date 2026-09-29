import path from "node:path";

/**
 * Extension -> MIME type for the photo/video formats a phone or camera
 * realistically produces. Deliberately raster images + videos only: an
 * extension-derived type ends up as the served Content-Type, so nothing that
 * a browser would execute (svg, html, ...) may come out of this table.
 */
const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".hif": "image/heif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".bmp": "image/bmp",
  ".dng": "image/x-adobe-dng",
  ".cr2": "image/x-canon-cr2",
  ".cr3": "image/x-canon-cr3",
  ".nef": "image/x-nikon-nef",
  ".arw": "image/x-sony-arw",
  ".raf": "image/x-fuji-raf",
  ".orf": "image/x-olympus-orf",
  ".rw2": "image/x-panasonic-rw2",
  ".pef": "image/x-pentax-pef",
  ".srw": "image/x-samsung-srw",
  ".mov": "video/quicktime",
  ".qt": "video/quicktime",
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".3gp": "video/3gpp",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mts": "video/mp2t",
  ".m2ts": "video/mp2t",
};

/** Client-sent types that carry no information about the actual format. */
const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream", "application/x-unknown"]);

/**
 * The iOS app uploads every file as `application/octet-stream` (see
 * APIClient.upload), browsers sometimes send nothing useful for HEIC either.
 * Storing that verbatim made iPhone photos/videos look like opaque downloads:
 * no EXIF/metadata, no video player, forced `Content-Disposition: attachment`.
 * A generic client type is therefore replaced by the one implied by the file
 * extension; a specific client type is kept as-is.
 */
export function resolveMimeType(clientMimeType: string | null | undefined, filename: string): string {
  const client = (clientMimeType ?? "").trim().toLowerCase();
  if (!GENERIC_MIME_TYPES.has(client)) return client;
  return EXTENSION_MIME_TYPES[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}

/** Same as resolveMimeType, for rows stored before uploads were normalized. */
export function effectiveMimeType(asset: { mimeType: string | null; filename: string }): string {
  return resolveMimeType(asset.mimeType, asset.filename);
}

/** RAW formats need `dcraw` to decode pixels (see rawDecoder.service.ts) -
 * sharp/libvips can only read their embedded EXIF, not develop them. */
const RAW_MIME_TYPES = new Set([
  "image/x-adobe-dng",
  "image/x-canon-cr2",
  "image/x-canon-cr3",
  "image/x-nikon-nef",
  "image/x-sony-arw",
  "image/x-fuji-raf",
  "image/x-olympus-orf",
  "image/x-panasonic-rw2",
  "image/x-pentax-pef",
  "image/x-samsung-srw",
]);

export function isRawMimeType(mimeType: string): boolean {
  return RAW_MIME_TYPES.has(mimeType);
}

export type MediaKind = "image" | "video" | "other";

export function mediaKind(mimeType: string): MediaKind {
  if (mimeType.startsWith("image/") && !mimeType.startsWith("image/svg")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "other";
}

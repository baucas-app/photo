import { imageUrl } from "./apiKey";
import type { Asset } from "./types";

// Fallback for rows uploaded before the backend normalized upload types: the
// iOS app sends everything as application/octet-stream.
const EXTENSION_MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
  dng: "image/x-adobe-dng",
  cr2: "image/x-canon-cr2",
  cr3: "image/x-canon-cr3",
  nef: "image/x-nikon-nef",
  arw: "image/x-sony-arw",
  raf: "image/x-fuji-raf",
  orf: "image/x-olympus-orf",
  rw2: "image/x-panasonic-rw2",
  pef: "image/x-pentax-pef",
  srw: "image/x-samsung-srw",
  mov: "video/quicktime",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  webm: "video/webm",
};

// Mirrors backend/src/utils/mediaType.ts RAW_MIME_TYPES - dcraw-decoded
// formats that need the server-generated thumbnail/preview, never <img src=original>.
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

export function effectiveMimeType(asset: Pick<Asset, "mimeType" | "filename">): string {
  const stored = asset.mimeType?.toLowerCase() ?? "";
  if (stored && stored !== "application/octet-stream") return stored;
  const extension = asset.filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME_TYPES[extension] ?? stored;
}

export function isVideoAsset(asset: Pick<Asset, "mimeType" | "filename">): boolean {
  return effectiveMimeType(asset).startsWith("video/");
}

// Formats every current browser renders in <img>. HEIC/HEIF (iPhone default),
// TIFF and RAW are not among them (HEIC only works in Safari) - those are
// shown via the server-generated JPEG preview instead.
const BROWSER_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/bmp"]);

export function canBrowserDisplayOriginal(asset: Pick<Asset, "mimeType" | "filename">): boolean {
  return BROWSER_IMAGE_TYPES.has(effectiveMimeType(asset));
}

export function isRawAsset(asset: Pick<Asset, "mimeType" | "filename">): boolean {
  return RAW_MIME_TYPES.has(effectiveMimeType(asset));
}

/**
 * Best always-static image URL for an asset - the real file when the browser
 * can render it directly, otherwise the server's JPEG preview (also covers
 * HEIC/TIFF/RAW and video posters). Used by the slideshow, which never plays
 * video/audio and just cycles through stills.
 */
export function stillImageUrl(asset: Pick<Asset, "id" | "size" | "mimeType" | "filename">): string {
  const version = asset.size != null ? `?v=${asset.size}` : "";
  const path = canBrowserDisplayOriginal(asset) ? "file" : "preview";
  return imageUrl(`/assets/${asset.id}/${path}${version}`);
}

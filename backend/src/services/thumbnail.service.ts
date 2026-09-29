import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Response } from "express";
import sharp, { type Sharp } from "sharp";
import { env } from "../config/env.js";
import { effectiveMimeType, isRawMimeType, mediaKind, type MediaKind } from "../utils/mediaType.js";
import { toAbsolutePath } from "./filesystem.service.js";
import { openImage } from "./imageDecoder.service.js";
import { decodeRawToTiff, isDcrawAvailable } from "./rawDecoder.service.js";
import { extractVideoFrame, isFfmpegAvailable } from "./videoFrame.service.js";

/**
 * Two server-rendered variants per asset (same idea as Immich's
 * thumbnail/preview split):
 * - "thumbnail": 400x400 square WebP for grids.
 * - "preview":   JPEG, longest edge 2048px, for the full-screen viewer. Needed
 *   because browsers other than Safari can't render the HEIC originals
 *   iPhones upload; for videos it's the poster frame.
 * The original stays untouched and is still served by /file for downloads.
 */
export type Rendition = "thumbnail" | "preview";

interface RenditionSpec {
  suffix: string;
  contentType: string;
  render: (image: Sharp) => Sharp;
  placeholderSize: number;
}

const RENDITIONS: Record<Rendition, RenditionSpec> = {
  thumbnail: {
    // No suffix: keeps thumbnails cached before the preview variant existed valid.
    suffix: ".webp",
    contentType: "image/webp",
    render: (image) => image.resize(400, 400, { fit: "cover" }).webp({ quality: 80 }),
    placeholderSize: 400,
  },
  preview: {
    suffix: "-preview.jpg",
    contentType: "image/jpeg",
    render: (image) =>
      image
        .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true }),
    placeholderSize: 1024,
  },
};

interface AssetRef {
  id: string;
  path: string;
  mimeType: string | null;
  filename: string;
}

type RenditionResult =
  | { kind: "file"; path: string; contentType: string }
  | { kind: "placeholder"; buffer: Buffer; contentType: string };

function cachePath(assetId: string, rendition: Rendition): string {
  return path.join(env.thumbnailCacheRoot, `${assetId}${RENDITIONS[rendition].suffix}`);
}

async function openSource(asset: AssetRef, kind: MediaKind, rendition: Rendition): Promise<Sharp | null> {
  const absolutePath = toAbsolutePath(asset.path);
  if (kind === "video") {
    if (!(await isFfmpegAvailable())) return null;
    return sharp(await extractVideoFrame(absolutePath));
  }
  if (isRawMimeType(effectiveMimeType(asset))) {
    if (!(await isDcrawAvailable())) return null;
    // Full resolution for the preview (viewer, potential re-editing), half
    // for the grid thumbnail - see decodeRawToTiff's doc comment.
    return sharp(await decodeRawToTiff(absolutePath, { halfSize: rendition === "thumbnail" }));
  }
  // "other" is still attempted: sharp sniffs the real format from the bytes,
  // so e.g. an image stored with a wrong/unknown type still gets a thumbnail.
  return openImage(absolutePath);
}

async function render(asset: AssetRef, rendition: Rendition, kind: MediaKind, target: string): Promise<boolean> {
  const source = await openSource(asset, kind, rendition);
  if (!source) return false;

  await fs.mkdir(env.thumbnailCacheRoot, { recursive: true });
  // Render to a unique temp file and rename into place: writing straight to
  // the cache path would let a concurrent request pass the access() check
  // and serve a half-written file.
  const tempPath = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await RENDITIONS[rendition].render(source).toFile(tempPath);
    await fs.rename(tempPath, target);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
  return true;
}

// One generation per cache file at a time: a grid of HEIC photos otherwise
// decodes the same image several times in parallel (WASM decode is ~0.4s).
const inFlight = new Map<string, Promise<boolean>>();
// Undecodable files (corrupt, exotic RAW, video without ffmpeg) aren't retried
// on every grid render - only after this cool-down.
const failedAt = new Map<string, number>();
const RETRY_FAILED_AFTER_MS = 10 * 60 * 1000;

async function ensureRendition(asset: AssetRef, rendition: Rendition, kind: MediaKind): Promise<boolean> {
  const target = cachePath(asset.id, rendition);
  try {
    await fs.access(target);
    return true;
  } catch {
    // Not cached yet - generate it once, below.
  }

  const lastFailure = failedAt.get(target);
  if (lastFailure && Date.now() - lastFailure < RETRY_FAILED_AFTER_MS) return false;

  let pending = inFlight.get(target);
  if (!pending) {
    pending = render(asset, rendition, kind, target)
      .catch((error: unknown) => {
        console.warn(`[thumbnail] ${rendition} for asset ${asset.id} (${asset.filename}) failed:`, error);
        return false;
      })
      .then((ok) => {
        if (ok) failedAt.delete(target);
        else failedAt.set(target, Date.now());
        return ok;
      })
      .finally(() => inFlight.delete(target));
    inFlight.set(target, pending);
  }
  return pending;
}

const PLACEHOLDER_ICONS: Record<MediaKind, string> = {
  // Play triangle
  video: `<circle cx="50" cy="50" r="22" fill="none" stroke="#8a8f98" stroke-width="3"/><path d="M44 39 L63 50 L44 61 Z" fill="#8a8f98"/>`,
  // Landscape picture
  image: `<rect x="28" y="32" width="44" height="36" rx="3" fill="none" stroke="#8a8f98" stroke-width="3"/><circle cx="40" cy="43" r="4" fill="#8a8f98"/><path d="M31 65 L46 50 L56 59 L62 54 L70 65 Z" fill="#8a8f98"/>`,
  // Document
  other: `<path d="M36 28 H56 L66 38 V72 H36 Z" fill="none" stroke="#8a8f98" stroke-width="3" stroke-linejoin="round"/><path d="M56 28 V38 H66" fill="none" stroke="#8a8f98" stroke-width="3" stroke-linejoin="round"/>`,
};

const placeholderCache = new Map<string, Promise<Buffer>>();

function placeholder(kind: MediaKind, rendition: Rendition): Promise<Buffer> {
  const key = `${kind}:${rendition}`;
  let buffer = placeholderCache.get(key);
  if (!buffer) {
    const size = RENDITIONS[rendition].placeholderSize;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><rect width="100" height="100" fill="#2a2d33"/>${PLACEHOLDER_ICONS[kind]}</svg>`;
    const image = sharp(Buffer.from(svg));
    buffer = (rendition === "thumbnail" ? image.webp({ quality: 80 }) : image.jpeg({ quality: 85 })).toBuffer();
    placeholderCache.set(key, buffer);
  }
  return buffer;
}

export async function getRendition(asset: AssetRef, rendition: Rendition): Promise<RenditionResult> {
  const kind = mediaKind(effectiveMimeType(asset));
  const { contentType } = RENDITIONS[rendition];
  if (await ensureRendition(asset, rendition, kind)) {
    return { kind: "file", path: cachePath(asset.id, rendition), contentType };
  }
  return { kind: "placeholder", buffer: await placeholder(kind, rendition), contentType };
}

/**
 * Sends the requested variant, or a neutral icon placeholder (200, not 500)
 * when the file can't be rendered - an <img> in the grid should show "video"
 * or "unknown file" rather than a broken-image icon. Placeholders are marked
 * no-store so a real thumbnail shows up once it can be generated (e.g. after
 * ffmpeg gets installed).
 */
export async function sendRendition(res: Response, asset: AssetRef, rendition: Rendition): Promise<void> {
  const result = await getRendition(asset, rendition);
  if (result.kind === "file") {
    res.sendFile(result.path, { headers: { "Content-Type": result.contentType } });
    return;
  }
  res
    .status(200)
    .set({ "Content-Type": result.contentType, "Cache-Control": "no-store", "X-Rendition-Placeholder": "1" })
    .send(result.buffer);
}

export async function invalidateThumbnail(assetId: string): Promise<void> {
  await Promise.all(
    (Object.keys(RENDITIONS) as Rendition[]).map((rendition) =>
      fs.rm(cachePath(assetId, rendition), { force: true }),
    ),
  );
}

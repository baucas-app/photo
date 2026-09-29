import { promises as fs } from "node:fs";
import decodeHeic from "heic-decode";
import sharp, { type Sharp } from "sharp";

/**
 * The prebuilt libvips that ships with the `sharp` npm package includes
 * libheif, but only with the AV1 (AVIF) decoder - the HEVC decoder libde265
 * is left out for patent/licensing reasons. So `sharp(file.heic).metadata()`
 * works (dimensions, format "heif", compression "hevc"), yet any pixel access
 * fails with "heif: Decoder plugin generated an error: Unspecified (7.0)".
 * Every iPhone photo is HEVC-HEIC by default.
 *
 * Immich solves this with a self-compiled libvips/libheif/libde265 in its
 * Docker base image. We keep the stock npm binaries and instead decode HEVC
 * via `heic-decode` (libheif compiled to WebAssembly, pure npm install, no
 * system packages), then hand the raw RGBA pixels back to sharp for
 * resizing/encoding. If the process runs against a libvips that *can* decode
 * HEVC (e.g. a global libvips build), that native path is used instead.
 */
let nativeHevcSupported: boolean | undefined;

async function probeNativeHevc(absolutePath: string): Promise<boolean> {
  if (nativeHevcSupported === undefined) {
    nativeHevcSupported = await sharp(absolutePath)
      .resize(8, 8)
      .raw()
      .toBuffer()
      .then(() => true)
      .catch(() => false);
  }
  return nativeHevcSupported;
}

async function decodeHeicToSharp(absolutePath: string): Promise<Sharp> {
  const file = await fs.readFile(absolutePath);
  // libheif applies the HEIF rotation/mirror properties itself, so the pixels
  // come back upright - no .rotate() needed (the raw buffer has no EXIF anyway).
  const { width, height, data } = await decodeHeic({ buffer: file });
  return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width, height, channels: 4 },
  });
}

/**
 * Opens an image file as a sharp pipeline, transparently handling HEVC-HEIC.
 * EXIF orientation is applied (`.rotate()`), so callers get upright pixels.
 */
export async function openImage(absolutePath: string): Promise<Sharp> {
  const metadata = await sharp(absolutePath).metadata();
  if (metadata.format === "heif" && metadata.compression === "hevc" && !(await probeNativeHevc(absolutePath))) {
    return decodeHeicToSharp(absolutePath);
  }
  return sharp(absolutePath).rotate();
}

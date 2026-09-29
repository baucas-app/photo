import exifr from "exifr";
import sharp from "sharp";

export interface ExtractedMetadata {
  width: number | null;
  height: number | null;
  takenAt: Date | null;
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  iso: number | null;
  fNumber: number | null;
  exposureTime: number | null;
  focalLength: number | null;
  latitude: number | null;
  longitude: number | null;
  is360: boolean;
}

const EXIF_FIELDS = [
  "DateTimeOriginal",
  "CreateDate",
  "Make",
  "Model",
  "LensModel",
  "ISO",
  "FNumber",
  "ExposureTime",
  "FocalLength",
] as const;

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 360°/equirectangular photos carry Google's GPano XMP schema
 * (ProjectionType: "equirectangular"). Not every tool writes it, so a
 * 2:1-ish aspect ratio on a large image is treated as a fallback signal too
 * (true spherical panoramas are exactly 2:1; iPhone's regular sweep
 * panoramas are much taller/narrower than that, e.g. 4:1+, and won't match).
 */
function detect360(xmp: Record<string, unknown> | null, width: number | null, height: number | null): boolean {
  const projectionType = xmp?.ProjectionType ?? xmp?.["GPano:ProjectionType"];
  if (typeof projectionType === "string" && projectionType.toLowerCase() === "equirectangular") return true;
  if (xmp?.UsePanoramaViewer === true) return true;
  if (width && height && width >= 3000) {
    const ratio = width / height;
    return ratio >= 1.9 && ratio <= 2.1;
  }
  return false;
}

export async function extractImageMetadata(absolutePath: string): Promise<ExtractedMetadata> {
  const [exif, gps, xmp, image] = await Promise.all([
    exifr.parse(absolutePath, { pick: [...EXIF_FIELDS] }).catch(() => null),
    // Separate parse call: exifr's `gps: true` shortcut (decimal
    // latitude/longitude, sign-corrected for hemisphere) only kicks in when
    // it's the sole option, so it can't just be added to the `pick` call above.
    exifr.gps(absolutePath).catch(() => null),
    // Likewise for XMP (GPano panorama tags): a dedicated, minimal parse call
    // so it doesn't pull in every other block for every single upload.
    exifr
      .parse(absolutePath, { tiff: false, exif: false, gps: false, icc: false, iptc: false, xmp: true })
      .catch(() => null),
    sharp(absolutePath).metadata().catch(() => null),
  ]);

  const takenAt = exif?.DateTimeOriginal ?? exif?.CreateDate ?? null;

  return {
    width: image?.width ?? null,
    height: image?.height ?? null,
    takenAt: takenAt instanceof Date ? takenAt : null,
    cameraMake: toStringOrNull(exif?.Make),
    cameraModel: toStringOrNull(exif?.Model),
    lensModel: toStringOrNull(exif?.LensModel),
    iso: toNumberOrNull(exif?.ISO),
    fNumber: toNumberOrNull(exif?.FNumber),
    exposureTime: toNumberOrNull(exif?.ExposureTime),
    focalLength: toNumberOrNull(exif?.FocalLength),
    latitude: toNumberOrNull(gps?.latitude),
    longitude: toNumberOrNull(gps?.longitude),
    is360: detect360(xmp, image?.width ?? null, image?.height ?? null),
  };
}

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

export async function extractImageMetadata(absolutePath: string): Promise<ExtractedMetadata> {
  const [exif, image] = await Promise.all([
    exifr.parse(absolutePath, { pick: [...EXIF_FIELDS] }).catch(() => null),
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
  };
}

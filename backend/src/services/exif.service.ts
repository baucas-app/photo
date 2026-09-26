import exifr from "exifr";
import sharp from "sharp";

export interface ExtractedMetadata {
  width: number | null;
  height: number | null;
  takenAt: Date | null;
  cameraMake: string | null;
  cameraModel: string | null;
}

export async function extractImageMetadata(absolutePath: string): Promise<ExtractedMetadata> {
  const [exif, image] = await Promise.all([
    exifr.parse(absolutePath, { pick: ["DateTimeOriginal", "CreateDate", "Make", "Model"] }).catch(() => null),
    sharp(absolutePath).metadata().catch(() => null),
  ]);

  const takenAt = exif?.DateTimeOriginal ?? exif?.CreateDate ?? null;

  return {
    width: image?.width ?? null,
    height: image?.height ?? null,
    takenAt: takenAt instanceof Date ? takenAt : null,
    cameraMake: typeof exif?.Make === "string" ? exif.Make.trim() : null,
    cameraModel: typeof exif?.Model === "string" ? exif.Model.trim() : null,
  };
}

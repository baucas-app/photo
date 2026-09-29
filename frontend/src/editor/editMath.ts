/**
 * Coordinate math for the photo editor.
 *
 * Backend semantics (edit.service.ts): every edit is computed fresh from the
 * untouched original O as   rotate(crop(O))   - crop in O's (upright) pixel
 * coordinates first, then a clockwise rotation. It is NOT cumulative.
 *
 * The browser, however, can only load the *current* file D, which already
 * has the previous edit baked in: D = rotate_Rp(crop_Cp(O)). So when the
 * user rotates D a further Rn degrees and draws a crop K on that, we have
 * to translate K back into O coordinates and add the rotations up, so the
 * one server call reproduces exactly what the user saw.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A previously saved edit, in original-image terms (what the server applied). */
export interface AppliedEdit {
  rotate: Rotation;
  crop?: Rect;
  brightness: number;
  contrast: number;
}

export function normalizeRotation(degrees: number): Rotation {
  return ((((Math.round(degrees / 90) * 90) % 360) + 360) % 360) as Rotation;
}

export function isQuarterTurn(rotation: Rotation): boolean {
  return rotation === 90 || rotation === 270;
}

/**
 * Maps a rect drawn on `rotate_R(S)` back to S's coordinates, where S is
 * `sourceWidth` x `sourceHeight`. Rotation is clockwise (sharp + canvas).
 */
export function unrotateRect(rect: Rect, rotation: Rotation, sourceWidth: number, sourceHeight: number): Rect {
  const { left: u, top: v, width: w, height: h } = rect;
  switch (rotation) {
    case 0:
      return { ...rect };
    case 90:
      // S(x, y) -> R(H - y, x)
      return { left: v, top: sourceHeight - (u + w), width: h, height: w };
    case 180:
      return { left: sourceWidth - (u + w), top: sourceHeight - (v + h), width: w, height: h };
    case 270:
      // S(x, y) -> R(y, W - x)
      return { left: sourceWidth - (v + h), top: u, width: h, height: w };
  }
}

export interface ComposeInput {
  previous: AppliedEdit | null;
  /** Additional rotation the user applied in the editor on top of the current file. */
  extraRotation: Rotation;
  /** Crop drawn in the editor, in percent (0-100) of the rotated current image; null = none. */
  cropPercent: { x: number; y: number; width: number; height: number } | null;
  /** Real pixel size of the current (already edited) file, upright. */
  currentWidth: number;
  currentHeight: number;
}

export interface ComposedEdit {
  rotate: Rotation;
  crop?: Rect;
}

/** Combines the previous edit with what the user just did, in original-image coordinates. */
export function composeEdit({ previous, extraRotation, cropPercent, currentWidth, currentHeight }: ComposeInput): ComposedEdit {
  const previousRotation = previous?.rotate ?? 0;
  const totalRotation = normalizeRotation(previousRotation + extraRotation);

  // S = crop_Cp(O): what the previous edit had left before rotating.
  const sourceWidth = previous?.crop
    ? previous.crop.width
    : isQuarterTurn(previousRotation)
      ? currentHeight
      : currentWidth;
  const sourceHeight = previous?.crop
    ? previous.crop.height
    : isQuarterTurn(previousRotation)
      ? currentWidth
      : currentHeight;
  const offsetLeft = previous?.crop?.left ?? 0;
  const offsetTop = previous?.crop?.top ?? 0;

  const isFullFrame =
    !cropPercent || (cropPercent.x <= 0.05 && cropPercent.y <= 0.05 && cropPercent.width >= 99.9 && cropPercent.height >= 99.9);
  if (isFullFrame) {
    return { rotate: totalRotation, crop: previous?.crop ? { ...previous.crop } : undefined };
  }

  // The editor canvas shows rotate_total(S).
  const editorWidth = isQuarterTurn(totalRotation) ? sourceHeight : sourceWidth;
  const editorHeight = isQuarterTurn(totalRotation) ? sourceWidth : sourceHeight;
  const drawn: Rect = {
    left: (cropPercent.x / 100) * editorWidth,
    top: (cropPercent.y / 100) * editorHeight,
    width: (cropPercent.width / 100) * editorWidth,
    height: (cropPercent.height / 100) * editorHeight,
  };
  const inSource = unrotateRect(drawn, totalRotation, sourceWidth, sourceHeight);

  // Integer pixels, clamped to S so sharp's extract() never goes out of bounds.
  const left = clamp(Math.round(inSource.left), 0, sourceWidth - 1);
  const top = clamp(Math.round(inSource.top), 0, sourceHeight - 1);
  const width = clamp(Math.round(inSource.width), 1, sourceWidth - left);
  const height = clamp(Math.round(inSource.height), 1, sourceHeight - top);

  return { rotate: totalRotation, crop: { left: left + offsetLeft, top: top + offsetTop, width, height } };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * CSS filter approximating the server's brightness (sharp modulate) and
 * contrast (linear around mid-grey) - relative to what the current file
 * already has baked in from the previous edit.
 */
export function previewFilter(brightness: number, contrast: number, previous: AppliedEdit | null): string {
  const base = (value: number) => Math.max(0.01, 1 + value / 100);
  const b = base(brightness) / base(previous?.brightness ?? 0);
  const c = base(contrast) / base(previous?.contrast ?? 0);
  return `brightness(${b.toFixed(3)}) contrast(${c.toFixed(3)})`;
}

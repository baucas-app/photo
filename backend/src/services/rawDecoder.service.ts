import { spawn } from "node:child_process";

/**
 * RAW photos (CR2/CR3/NEF/ARW/RAF/ORF/RW2/DNG/...) need a real demosaicing
 * decoder - sharp/libvips can read their embedded EXIF/preview but not
 * develop the sensor data into pixels. Like ffmpeg for video posters, we
 * shell out to `dcraw`: an optional system binary, missing from the default
 * Docker image (add it to the apt-get line to enable this), present locally
 * via Homebrew (`brew install dcraw`). Path overridable via DCRAW_PATH.
 */
const DCRAW = process.env.DCRAW_PATH ?? "dcraw";
const TIMEOUT_MS = 60_000;

let dcrawAvailable: Promise<boolean> | undefined;

export function isDcrawAvailable(): Promise<boolean> {
  dcrawAvailable ??= new Promise((resolve) => {
    // Run with no file argument - dcraw prints its usage and exits non-zero,
    // but that still proves the binary exists and starts (an ENOENT would
    // surface as an 'error' event instead, never reaching 'close').
    const child = spawn(DCRAW, [], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", () => resolve(true));
  });
  return dcrawAvailable;
}

/**
 * Decodes a RAW file to a TIFF buffer, ready for sharp to resize/encode
 * further. `-w` applies the camera's own white balance (dcraw's default
 * otherwise renders a flat, greenish image); `-h` halves the output
 * resolution - plenty for a 400px grid thumbnail and much faster than
 * developing a full 24-50MP sensor image.
 */
export function decodeRawToTiff(absolutePath: string, options: { halfSize?: boolean } = {}): Promise<Buffer> {
  const { halfSize = false } = options;
  return new Promise((resolve, reject) => {
    const args = ["-c", "-T", "-w", ...(halfSize ? ["-h"] : []), absolutePath];
    // No shell: the path is a single argv entry, never interpreted.
    const child = spawn(DCRAW, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks);
      if (code === 0 && output.length > 0) resolve(output);
      else reject(new Error(`dcraw exited with ${code}: ${stderr.trim().slice(0, 500)}`));
    });
  });
}

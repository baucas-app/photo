import { spawn } from "node:child_process";

/**
 * Video poster frames need a real demuxer/decoder (HEVC .mov from iPhones,
 * H.264 .mp4, ...) - neither sharp/libvips nor any pure-JS package can do
 * that. Like Immich, we use ffmpeg - but as an *optional* system binary: if
 * it's missing (e.g. in the current Docker image), callers fall back to a
 * placeholder instead of failing. Path overridable via FFMPEG_PATH.
 */
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
// Ships alongside ffmpeg in both Homebrew and the apt package, so the same
// "optional binary, missing = degrade gracefully" story applies here too.
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";
const TIMEOUT_MS = 30_000;

let ffmpegAvailable: Promise<boolean> | undefined;

export function isFfmpegAvailable(): Promise<boolean> {
  ffmpegAvailable ??= new Promise((resolve) => {
    const child = spawn(FFMPEG, ["-version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
  return ffmpegAvailable;
}

let ffprobeAvailable: Promise<boolean> | undefined;

function isFfprobeAvailable(): Promise<boolean> {
  ffprobeAvailable ??= new Promise((resolve) => {
    const child = spawn(FFPROBE, ["-version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
  return ffprobeAvailable;
}

function grabFrame(absolutePath: string, seekSeconds: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      ...(seekSeconds > 0 ? ["-ss", String(seekSeconds)] : []),
      "-i",
      absolutePath,
      "-frames:v",
      "1",
      "-an",
      "-f",
      "image2pipe",
      "-c:v",
      "png",
      "pipe:1",
    ];
    // No shell: the path is a single argv entry, never interpreted.
    const child = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
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
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim().slice(0, 500)}`));
    });
  });
}

/**
 * Returns one decoded frame as PNG. Tries 1s in (skips black fade-ins), and
 * falls back to the very first frame for clips shorter than that - seeking
 * past the end yields zero frames, which is exactly the Live-Photo bug
 * Immich hit (immich-app/immich#31530). ffmpeg applies the rotation display
 * matrix of portrait iPhone videos itself.
 */
export async function extractVideoFrame(absolutePath: string): Promise<Buffer> {
  try {
    return await grabFrame(absolutePath, 1);
  } catch {
    return grabFrame(absolutePath, 0);
  }
}

export interface VideoMetadata {
  durationSeconds: number | null;
  takenAt: Date | null;
}

function probeFormat(absolutePath: string): Promise<{ duration?: string; tags?: { creation_time?: string } }> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "format=duration:format_tags=creation_time",
      "-of",
      "json",
      absolutePath,
    ];
    const child = spawn(FFPROBE, args, { stdio: ["ignore", "pipe", "pipe"] });
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
      if (code !== 0) {
        reject(new Error(`ffprobe exited with ${code}: ${stderr.trim().slice(0, 500)}`));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")).format ?? {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Duration (rounded to whole seconds, like Immich/Apple show it) and
 * recording date (from the container's creation_time tag, the video
 * equivalent of a photo's EXIF DateTimeOriginal) - `null`/`null` if ffprobe
 * is missing or the file has neither, same "degrade, don't fail" shape as
 * extractVideoFrame.
 */
export async function extractVideoMetadata(absolutePath: string): Promise<VideoMetadata> {
  if (!(await isFfprobeAvailable())) return { durationSeconds: null, takenAt: null };

  try {
    const format = await probeFormat(absolutePath);
    const parsedDuration = format.duration ? Math.round(parseFloat(format.duration)) : null;
    const creationTime = format.tags?.creation_time;
    const takenAt = creationTime ? new Date(creationTime) : null;
    return {
      durationSeconds: typeof parsedDuration === "number" && Number.isFinite(parsedDuration) ? parsedDuration : null,
      takenAt: takenAt && !Number.isNaN(takenAt.getTime()) ? takenAt : null,
    };
  } catch {
    return { durationSeconds: null, takenAt: null };
  }
}

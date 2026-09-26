import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { BadRequest, NotFound } from "../utils/httpError.js";

/**
 * The filesystem under STORAGE_ROOT is the source of truth for files.
 * Every path stored in Postgres is relative to STORAGE_ROOT (e.g. "/2024/Urlaub/photo1.jpg").
 * These helpers are the only place allowed to turn a relative path into an absolute one,
 * so path-traversal protection lives in exactly one spot.
 */

export function toAbsolutePath(relativePath: string): string {
  const normalized = path.normalize(relativePath).replace(/^([./\\]+)/, "/");
  const absolute = path.join(env.storageRoot, normalized);

  if (!absolute.startsWith(path.resolve(env.storageRoot))) {
    throw BadRequest("Invalid path");
  }
  return absolute;
}

export function toRelativePath(absolutePath: string): string {
  return "/" + path.relative(env.storageRoot, absolutePath).split(path.sep).join("/");
}

export async function ensureDir(relativePath: string): Promise<void> {
  await fs.mkdir(toAbsolutePath(relativePath), { recursive: true });
}

export async function pathExists(relativePath: string): Promise<boolean> {
  try {
    await fs.access(toAbsolutePath(relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function statFile(relativePath: string) {
  try {
    return await fs.stat(toAbsolutePath(relativePath));
  } catch {
    throw NotFound("File not found on disk");
  }
}

export async function deleteFile(relativePath: string): Promise<void> {
  await fs.rm(toAbsolutePath(relativePath), { force: true });
}

export async function renameEntry(fromRelative: string, toRelative: string): Promise<void> {
  await ensureDir(path.posix.dirname(toRelative));
  await fs.rename(toAbsolutePath(fromRelative), toAbsolutePath(toRelative));
}

export async function removeEmptyDir(relativePath: string): Promise<void> {
  try {
    await fs.rmdir(toAbsolutePath(relativePath));
  } catch {
    // Non-empty or already gone: leaving it alone is the safe default.
  }
}

export function yearMonthFolder(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `/${year}/${month}`;
}

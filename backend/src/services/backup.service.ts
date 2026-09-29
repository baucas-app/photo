import { exec } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "../config/env.js";

const execAsync = promisify(exec);

const backupDir = process.env.BACKUP_DIR ?? path.join(env.storageRoot, "_backups");
const MAX_BACKUPS = parseInt(process.env.BACKUP_KEEP_COUNT ?? "7", 10);

function ensureBackupDir() {
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
}

function parseDbUrl(url: string) {
  const u = new URL(url.replace("?schema=public", ""));
  return {
    host: u.hostname,
    port: u.port || "5432",
    user: u.username,
    pass: u.password,
    db: u.pathname.slice(1),
  };
}

export async function runBackup(): Promise<string> {
  ensureBackupDir();
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `backup-${ts}.sql.gz`;
  const filepath = path.join(backupDir, filename);

  const db = parseDbUrl(env.databaseUrl);
  const cmd = `pg_dump -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.db} | gzip > "${filepath}"`;

  await execAsync(cmd, {
    env: { ...process.env, PGPASSWORD: db.pass },
  });

  pruneOldBackups();
  return filename;
}

export function listBackups() {
  ensureBackupDir();
  return readdirSync(backupDir)
    .filter((f) => f.endsWith(".sql.gz"))
    .map((f) => {
      const stat = statSync(path.join(backupDir, f));
      return { filename: f, size: stat.size, createdAt: stat.birthtime };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function backupStream(filename: string) {
  // Prevent path traversal: only allow basename
  const safe = path.basename(filename);
  const filepath = path.join(backupDir, safe);
  if (!filepath.startsWith(backupDir) || !existsSync(filepath)) return null;
  return createReadStream(filepath);
}

export function deleteBackup(filename: string) {
  const safe = path.basename(filename);
  const filepath = path.join(backupDir, safe);
  if (!filepath.startsWith(backupDir) || !existsSync(filepath)) return false;
  unlinkSync(filepath);
  return true;
}

function pruneOldBackups() {
  const files = listBackups();
  files.slice(MAX_BACKUPS).forEach((f) => {
    try { unlinkSync(path.join(backupDir, f.filename)); } catch {}
  });
}

// Called from index.ts on a daily schedule.
export async function scheduledBackup() {
  try {
    const filename = await runBackup();
    console.log(`[backup] Daily backup completed: ${filename}`);
  } catch (err) {
    console.error("[backup] Daily backup failed:", err);
  }
}

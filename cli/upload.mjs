#!/usr/bin/env node
/**
 * Photos CLI Upload Tool
 *
 * Usage:
 *   node cli/upload.mjs --server http://photos.local:3001 \
 *                       --email admin@example.com \
 *                       --password "secret" \
 *                       --dir /path/to/photos
 *
 * Options:
 *   --server   Base URL of the Photos backend (required)
 *   --email    Account e-mail (required)
 *   --password Account password (required)
 *   --dir      Directory to scan recursively (default: current dir)
 *   --dry-run  Print what would be uploaded without uploading
 *   --threads  Parallel uploads (default: 4)
 */

import { createReadStream, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const SUPPORTED = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif",
  ".tiff", ".tif", ".bmp", ".avif",
  ".cr2", ".cr3", ".nef", ".arw", ".orf", ".rw2", ".dng", ".raf",
  ".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm",
]);

const MIME = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".heic": "image/heic",
  ".heif": "image/heif", ".tiff": "image/tiff", ".tif": "image/tiff",
  ".bmp": "image/bmp", ".avif": "image/avif",
  ".cr2": "image/x-canon-cr2", ".cr3": "image/x-canon-cr3",
  ".nef": "image/x-nikon-nef", ".arw": "image/x-sony-arw",
  ".orf": "image/x-olympus-orf", ".rw2": "image/x-panasonic-rw2",
  ".dng": "image/dng", ".raf": "image/x-fuji-raf",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/x-m4v",
  ".avi": "video/x-msvideo", ".mkv": "video/x-matroska",
  ".webm": "video/webm",
};

// ── CLI args ─────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    server:   { type: "string" },
    email:    { type: "string" },
    password: { type: "string" },
    dir:      { type: "string", default: "." },
    "dry-run":{ type: "boolean", default: false },
    threads:  { type: "string", default: "4" },
    help:     { type: "boolean", default: false },
  },
  allowPositionals: true,
});

if (values.help || !values.server || !values.email || !values.password) {
  console.log(`
Photos CLI Upload Tool

Usage:
  node cli/upload.mjs --server <url> --email <email> --password <pass> [options]

Options:
  --server    Backend URL (e.g. http://localhost:3001)
  --email     Account e-mail
  --password  Account password
  --dir       Directory to upload (default: current directory)
  --dry-run   List files without uploading
  --threads   Parallel uploads (default: 4)
  --help      Show this help
`);
  process.exit(values.help ? 0 : 1);
}

const SERVER = values.server.replace(/\/$/, "");
const DIR = resolve(values.dir ?? ".");
const DRY_RUN = values["dry-run"];
const THREADS = Math.max(1, parseInt(values.threads ?? "4", 10));

// ── Auth ─────────────────────────────────────────────────────────────────────

async function login() {
  const res = await fetch(`${SERVER}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: values.email, password: values.password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed (${res.status}): ${text}`);
  }
  const { accessToken } = await res.json();
  return accessToken;
}

// ── File discovery ───────────────────────────────────────────────────────────

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(full));
    } else if (SUPPORTED.has(extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

// ── Upload ───────────────────────────────────────────────────────────────────

async function uploadFile(filepath, token) {
  const ext = extname(filepath).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  const name = basename(filepath);
  const size = statSync(filepath).size;

  const form = new FormData();
  const blob = new Blob([await import("node:fs/promises").then(fs => fs.readFile(filepath))], { type: mime });
  form.append("file", blob, name);

  const res = await fetch(`${SERVER}/api/assets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return { name, size };
}

// ── Progress ─────────────────────────────────────────────────────────────────

function bar(done, total) {
  const pct = Math.floor((done / total) * 40);
  return `[${"█".repeat(pct)}${" ".repeat(40 - pct)}] ${done}/${total}`;
}

function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\nScanning ${DIR}…`);
  const files = await collectFiles(DIR);
  const totalSize = files.reduce((s, f) => s + statSync(f).size, 0);
  console.log(`Found ${files.length} file(s) (${bytes(totalSize)})\n`);

  if (files.length === 0) { console.log("Nothing to upload."); process.exit(0); }
  if (DRY_RUN) { files.forEach(f => console.log(f)); process.exit(0); }

  const token = await login();
  console.log("✓ Logged in\n");

  let done = 0, failed = 0, uploadedBytes = 0;
  const errors = [];
  const queue = [...files];

  async function worker() {
    while (queue.length > 0) {
      const filepath = queue.shift();
      try {
        const { size } = await uploadFile(filepath, token);
        done++;
        uploadedBytes += size;
      } catch (err) {
        failed++;
        errors.push({ filepath, err: err.message });
      }
      process.stdout.write(`\r${bar(done + failed, files.length)}  ${bytes(uploadedBytes)} uploaded`);
    }
  }

  await Promise.all(Array.from({ length: THREADS }, worker));
  console.log("\n");

  if (errors.length > 0) {
    console.log(`⚠ ${errors.length} file(s) failed:`);
    errors.forEach(({ filepath, err }) => console.log(`  ${filepath}: ${err}`));
  }
  console.log(`✓ Done — ${done} uploaded, ${failed} failed.`);
})().catch(err => { console.error(err.message); process.exit(1); });

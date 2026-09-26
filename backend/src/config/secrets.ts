import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * JWT secrets can be set via env var (JWT_SECRET/JWT_REFRESH_SECRET), but
 * for a plain "just the yaml" deployment nobody wants to hand-generate and
 * store those first. If they're missing, generate a random one and persist
 * it to a file under SECRETS_DIR (a named volume) so it survives container
 * restarts/recreation instead of invalidating every session each time.
 */
export function resolveSecret(envVar: string, filename: string): string {
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;

  const secretsDir = process.env.SECRETS_DIR ?? "/app-data";
  const filePath = path.join(secretsDir, filename);

  try {
    const existing = fs.readFileSync(filePath, "utf8").trim();
    if (existing) return existing;
  } catch {
    // Not generated yet - fall through and create one below.
  }

  const generated = crypto.randomBytes(48).toString("hex");
  fs.mkdirSync(secretsDir, { recursive: true });
  fs.writeFileSync(filePath, generated, { mode: 0o600 });
  return generated;
}

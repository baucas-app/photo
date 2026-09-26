import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveSecret } from "../src/config/secrets.js";

describe("resolveSecret", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "photos-secrets-"));
    process.env.SECRETS_DIR = tempDir;
    delete process.env.TEST_SECRET_VAR;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.SECRETS_DIR;
  });

  it("uses the env var when set, without touching disk", () => {
    process.env.TEST_SECRET_VAR = "explicit-value";
    expect(resolveSecret("TEST_SECRET_VAR", "unused.txt")).toBe("explicit-value");
    expect(fs.existsSync(path.join(tempDir, "unused.txt"))).toBe(false);
  });

  it("generates and persists a secret when unset, then reuses it", () => {
    const first = resolveSecret("TEST_SECRET_VAR", "generated.txt");
    expect(first).toMatch(/^[0-9a-f]{96}$/);

    const second = resolveSecret("TEST_SECRET_VAR", "generated.txt");
    expect(second).toBe(first);
  });
});

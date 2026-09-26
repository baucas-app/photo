import { describe, expect, it, beforeAll } from "vitest";

beforeAll(() => {
  process.env.STORAGE_ROOT = "/photos";
});

describe("toAbsolutePath", () => {
  it("resolves a normal relative path under the storage root", async () => {
    const { toAbsolutePath } = await import("../src/services/filesystem.service.js");
    expect(toAbsolutePath("/2024/Urlaub/photo1.jpg")).toBe("/photos/2024/Urlaub/photo1.jpg");
  });

  it("neutralizes path traversal instead of escaping the storage root", async () => {
    const { toAbsolutePath } = await import("../src/services/filesystem.service.js");
    expect(toAbsolutePath("../../etc/passwd").startsWith("/photos/")).toBe(true);
    expect(toAbsolutePath("/2024/../../../etc/passwd").startsWith("/photos/")).toBe(true);
  });
});

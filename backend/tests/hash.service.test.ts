import { describe, expect, it } from "vitest";
import { hammingDistance } from "../src/services/hash.service.js";

describe("hammingDistance", () => {
  it("returns 0 for identical hashes", () => {
    expect(hammingDistance("ff00ff00ff00ff00", "ff00ff00ff00ff00")).toBe(0);
  });

  it("counts differing bits", () => {
    expect(hammingDistance("0000000000000000", "0000000000000001")).toBe(1);
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
  });
});

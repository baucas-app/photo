import { describe, expect, it } from "vitest";
import { bufferToFloats, cosineSimilarity, floatsToBuffer } from "@photos/shared";

describe("vector helpers", () => {
  it("round-trips floats through a buffer", () => {
    const values = [0.1, -0.5, 3.25, 0];
    const roundTripped = bufferToFloats(floatsToBuffer(values));
    roundTripped.forEach((value, i) => expect(value).toBeCloseTo(values[i]!, 5));
  });

  it("scores identical vectors as maximally similar", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("scores orthogonal vectors as unrelated", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

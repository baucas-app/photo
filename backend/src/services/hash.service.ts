import { openImage } from "./imageDecoder.service.js";

/**
 * 64-bit average hash (aHash): resize to 8x8 grayscale, threshold each pixel
 * against the mean, pack the bits. Two images of the same photo re-encoded
 * at different quality/size produce hashes that differ by only a few bits,
 * which is what lets us detect near-duplicates instead of only byte-identical
 * files (a plain file hash would miss those).
 */
export async function computePerceptualHash(absolutePath: string): Promise<string> {
  // openImage: HEVC-HEIC (iPhone default) isn't decodable by the stock sharp binary.
  const { data } = await (await openImage(absolutePath))
    .resize(8, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mean = data.reduce((sum, value) => sum + value, 0) / data.length;

  let bits = 0n;
  for (let i = 0; i < data.length; i++) {
    bits <<= 1n;
    if (data[i]! > mean) {
      bits |= 1n;
    }
  }

  return bits.toString(16).padStart(16, "0");
}

export function hammingDistance(hashA: string, hashB: string): number {
  let a = BigInt(`0x${hashA}`);
  let b = BigInt(`0x${hashB}`);
  let xor = a ^ b;
  let distance = 0;
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}

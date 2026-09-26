export function floatsToBuffer(values: number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    buffer.writeFloatLE(values[i]!, i * 4);
  }
  return buffer;
}

export function bufferToFloats(buffer: Buffer): number[] {
  const values: number[] = [];
  for (let i = 0; i < buffer.length; i += 4) {
    values.push(buffer.readFloatLE(i));
  }
  return values;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

declare module "heic-decode" {
  interface DecodedHeic {
    width: number;
    height: number;
    /** RGBA, 4 bytes per pixel. */
    data: Uint8ClampedArray;
  }

  function decode(input: { buffer: ArrayBufferLike | Uint8Array }): Promise<DecodedHeic>;
  export default decode;
}

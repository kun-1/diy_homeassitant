declare module 'canvas-dither' {
  export interface DitherImageData {
    width: number;
    height: number;
    data: Uint8Array | Uint8ClampedArray;
  }

  export interface CanvasDither {
    grayscale<T extends DitherImageData>(image: T): T;
    threshold<T extends DitherImageData>(image: T, threshold: number): T;
    bayer<T extends DitherImageData>(image: T, threshold: number): T;
    floydsteinberg<T extends DitherImageData>(image: T): T;
    atkinson<T extends DitherImageData>(image: T): T;
  }

  const dither: CanvasDither;
  export default dither;
}

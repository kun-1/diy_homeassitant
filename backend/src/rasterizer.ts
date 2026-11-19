import Dither from 'canvas-dither';
import { PNG } from 'pngjs';
import { PRINTER_BYTES_PER_ROW, PRINTER_WIDTH_PX } from './printer-protocol.js';
import type { PrinterBitmapPayload } from './types.js';

export type DitherAlgorithm = 'atkinson' | 'floyd-steinberg' | 'bayer' | 'threshold';

export interface RasterizeOptions {
  gamma?: number;
  threshold?: number;
  algorithm?: DitherAlgorithm;
  contrastStretch?: boolean;
  brightness?: number; // -50 .. +50
}

export interface DensityStats {
  avgBlackPct: number;
  maxRowBlackPct: number;
  hotRowCount: number; // rows exceeding 65% black dots
  estimatedBands: number; // 48-row GS v 0 bands
}

export interface RasterizeResult {
  bitmap: Buffer;
  previewPng: Buffer;
  payload: PrinterBitmapPayload;
  stats: DensityStats;
}

const clampByte = (value: number): number => (value < 0 ? 0 : value > 255 ? 255 : value);

/**
 * Apply gamma brightening before binarization to compensate for thermal dot gain.
 * gamma > 1 brightens midtones so gray regions do not bleed into solid black.
 */
export function applyThermalGamma(gray: number, gamma: number): number {
  if (gamma <= 0 || gamma === 1) return gray;
  return 255 * Math.pow(clampByte(gray) / 255, 1 / gamma);
}

function stretchContrast(luma: Float32Array): void {
  const hist = new Uint32Array(256);
  for (let i = 0; i < luma.length; i++) {
    hist[Math.round(clampByte(luma[i]))]++;
  }
  const total = luma.length;
  const lowCut = Math.floor(total * 0.02);
  const highCut = Math.floor(total * 0.98);
  let acc = 0;
  let minV = 0;
  let maxV = 255;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= lowCut) {
      minV = i;
      break;
    }
  }
  acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= highCut) {
      maxV = i;
      break;
    }
  }
  const span = maxV - minV;
  if (span < 16) return;
  for (let i = 0; i < luma.length; i++) {
    luma[i] = clampByte(((luma[i] - minV) / span) * 255);
  }
}

/**
 * Preprocess RGBA (white-paper alpha composite, optional contrast stretch,
 * brightness & thermal gamma) then delegate 1-bit dithering to `canvas-dither`.
 */
function ditherRgbaBuffer(
  rgba: Uint8Array,
  width: number,
  height: number,
  options: RasterizeOptions,
): Uint8ClampedArray {
  const gamma = options.gamma ?? 1.1;
  const threshold = options.threshold ?? 150;
  const algorithm: DitherAlgorithm = options.algorithm ?? 'threshold';
  const brightness = options.brightness ?? 0;

  const pixelCount = width * height;
  const luma = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const alpha = rgba[o + 3] / 255;
    const r = rgba[o] * alpha + 255 * (1 - alpha);
    const g = rgba[o + 1] * alpha + 255 * (1 - alpha);
    const b = rgba[o + 2] * alpha + 255 * (1 - alpha);
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  if (options.contrastStretch) {
    stretchContrast(luma);
  }

  const imageData = {
    width,
    height,
    data: new Uint8ClampedArray(pixelCount * 4),
  };

  for (let i = 0; i < pixelCount; i++) {
    const v = Math.round(applyThermalGamma(clampByte(luma[i] + brightness), gamma));
    const o = i * 4;
    imageData.data[o] = v;
    imageData.data[o + 1] = v;
    imageData.data[o + 2] = v;
    imageData.data[o + 3] = 255;
  }

  if (algorithm === 'atkinson') {
    Dither.atkinson(imageData);
  } else if (algorithm === 'floyd-steinberg') {
    Dither.floydsteinberg(imageData);
  } else if (algorithm === 'bayer') {
    Dither.bayer(imageData, threshold);
  } else {
    Dither.threshold(imageData, threshold);
  }

  return imageData.data;
}

/**
 * Pre-dither an arbitrary-size RGBA image (e.g. photo or sticker) into a pure
 * 0/255 PNG using `canvas-dither` for Hybrid Rasterization.
 */
export function ditherRgbaToPng(
  rgba: Uint8Array,
  width: number,
  height: number,
  options: RasterizeOptions = {},
): Buffer {
  const dithered = ditherRgbaBuffer(rgba, width, height, {
    algorithm: options.algorithm ?? 'atkinson',
    gamma: options.gamma ?? 1.8,
    threshold: options.threshold ?? 128,
    contrastStretch: options.contrastStretch ?? true,
    brightness: options.brightness ?? 0,
  });

  const out = new PNG({ width, height });
  out.data.set(dithered);
  return PNG.sync.write(out);
}

/**
 * Convert an RGBA buffer (expected width 384px) into a 1-bit MSB-first thermal
 * bitmap (bit 1 = black dot, bit 0 = white), matching 1-bit PNG preview, and
 * thermal head density statistics.
 */
export function rgbaTo1BitRaster(
  rgba: Uint8Array,
  width: number,
  height: number,
  options: RasterizeOptions = {},
): RasterizeResult {
  if (width !== PRINTER_WIDTH_PX) {
    throw new Error(`bitmap width must be ${PRINTER_WIDTH_PX}px, got ${width}`);
  }
  if (!Number.isInteger(height) || height < 1) {
    throw new Error(`bitmap height must be a positive integer, got ${height}`);
  }

  const dithered = ditherRgbaBuffer(rgba, width, height, options);
  const bitmap = Buffer.alloc(height * PRINTER_BYTES_PER_ROW);
  const preview = new PNG({ width, height });
  preview.data.set(dithered);

  let totalBlack = 0;
  let maxRowBlack = 0;
  let hotRowCount = 0;
  const hotThreshold = Math.floor(width * 0.65);

  for (let y = 0; y < height; y++) {
    let rowBlack = 0;
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const isBlack = dithered[p] === 0;
      if (isBlack) {
        rowBlack++;
        const byteIndex = y * PRINTER_BYTES_PER_ROW + (x >> 3);
        bitmap[byteIndex] |= 0x80 >> (x & 7);
      }
    }
    totalBlack += rowBlack;
    if (rowBlack > maxRowBlack) maxRowBlack = rowBlack;
    if (rowBlack > hotThreshold) hotRowCount++;
  }

  const previewPng = PNG.sync.write(preview);
  const totalPixels = width * height;
  return {
    bitmap,
    previewPng,
    payload: {
      format: 'MONO_1BPP_MSB_FIRST',
      widthPx: PRINTER_WIDTH_PX,
      heightPx: height,
      bytesPerRow: PRINTER_BYTES_PER_ROW as 48,
      bitmapB64: bitmap.toString('base64'),
    },
    stats: {
      avgBlackPct: Number(((totalBlack / totalPixels) * 100).toFixed(1)),
      maxRowBlackPct: Number(((maxRowBlack / width) * 100).toFixed(1)),
      hotRowCount,
      estimatedBands: Math.ceil(height / 48),
    },
  };
}

/**
 * Decode a PNG buffer and convert it to a 1-bit thermal raster.
 */
export function pngBufferTo1BitRaster(
  pngBuffer: Buffer,
  options: RasterizeOptions = {},
): RasterizeResult {
  const parsed = PNG.sync.read(pngBuffer);
  return rgbaTo1BitRaster(parsed.data, parsed.width, parsed.height, options);
}

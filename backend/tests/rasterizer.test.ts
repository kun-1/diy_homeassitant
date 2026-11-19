import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import {
  applyThermalGamma,
  ditherRgbaToPng,
  pngBufferTo1BitRaster,
  rgbaTo1BitRaster,
} from '../src/rasterizer.js';
import { buildReceiptHtml } from '../src/receipt-templates.js';
import { PRINTER_BYTES_PER_ROW, PRINTER_WIDTH_PX, validateBitmapPayload } from '../src/printer-protocol.js';

describe('thermal rasterizer and templates', () => {
  it('brightens midtones when gamma > 1', () => {
    expect(applyThermalGamma(128, 1)).toBe(128);
    expect(applyThermalGamma(128, 1.8)).toBeGreaterThan(128);
  });

  it('packs solid black and solid white rows MSB-first into 48 bytes/row', () => {
    const height = 2;
    const rgba = new Uint8Array(PRINTER_WIDTH_PX * height * 4);
    for (let x = 0; x < PRINTER_WIDTH_PX; x++) {
      // Row 0: pure black
      const r0 = x * 4;
      rgba[r0] = 0;
      rgba[r0 + 1] = 0;
      rgba[r0 + 2] = 0;
      rgba[r0 + 3] = 255;
      // Row 1: pure white
      const r1 = (PRINTER_WIDTH_PX + x) * 4;
      rgba[r1] = 255;
      rgba[r1 + 1] = 255;
      rgba[r1 + 2] = 255;
      rgba[r1 + 3] = 255;
    }

    const result = rgbaTo1BitRaster(rgba, PRINTER_WIDTH_PX, height, {
      algorithm: 'threshold',
      gamma: 1,
    });
    validateBitmapPayload(result.payload);
    expect(result.bitmap.subarray(0, PRINTER_BYTES_PER_ROW)).toEqual(
      Buffer.alloc(PRINTER_BYTES_PER_ROW, 0xff),
    );
    expect(result.bitmap.subarray(PRINTER_BYTES_PER_ROW)).toEqual(
      Buffer.alloc(PRINTER_BYTES_PER_ROW, 0x00),
    );

    const parsedPreview = PNG.sync.read(result.previewPng);
    expect(parsedPreview.width).toBe(PRINTER_WIDTH_PX);
    expect(parsedPreview.height).toBe(height);
  });

  it('round-trips PNG buffer with atkinson dithering', () => {
    const png = new PNG({ width: PRINTER_WIDTH_PX, height: 4 });
    png.data.fill(160);
    const result = pngBufferTo1BitRaster(PNG.sync.write(png), {
      algorithm: 'atkinson',
      gamma: 1.8,
    });
    validateBitmapPayload(result.payload);
    expect(result.bitmap.length).toBe(PRINTER_BYTES_PER_ROW * 4);
  });

  it('renders all 4 core templates + calibration with both styles and font profiles', () => {
    for (const style of ['receipt', 'journal'] as const) {
      for (const font of ['source-han', 'pixel'] as const) {
        const todoHtml = buildReceiptHtml(
          'todo',
          style,
          { items: [{ title: '测试任务', priority: 'high' }] },
          font,
        );
        const focusHtml = buildReceiptHtml(
          'focus',
          style,
          { title: '专注测试', subtasks: ['步骤一'] },
          font,
        );
        const noteHtml = buildReceiptHtml('note', style, { body: '测试留言' }, font);
        const photoHtml = buildReceiptHtml('photo', style, { caption: '晚霞' }, font);
        const calHtml = buildReceiptHtml('calibration', style, {}, font);

        expect(todoHtml).toContain('width: 384px');
        expect(todoHtml).toContain('tear-footer');
        expect(focusHtml).toContain('专注测试');
        expect(noteHtml).toContain('测试留言');
        expect(photoHtml).toContain('晚霞');
        expect(calHtml).toContain('EM5823H');
      }
    }
  });

  it('computes density stats and pre-dithers arbitrary photo dimensions to pure 0/255 PNG', () => {
    const rgba = new Uint8Array(40 * 20 * 4);
    rgba.fill(140);
    const pngBuf = ditherRgbaToPng(rgba, 40, 20, {
      algorithm: 'atkinson',
      gamma: 1.8,
      contrastStretch: true,
    });
    const decoded = PNG.sync.read(pngBuf);
    expect(decoded.width).toBe(40);
    expect(decoded.height).toBe(20);
    for (let i = 0; i < decoded.data.length; i += 4) {
      expect([0, 255]).toContain(decoded.data[i]);
    }
  });
});

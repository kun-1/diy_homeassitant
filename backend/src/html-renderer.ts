import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import {
  DEFAULT_ALGORITHM,
  DEFAULT_FONT_PROFILE,
  DEFAULT_FONT_SCALE,
  DEFAULT_GAMMA,
  DEFAULT_THRESHOLD,
} from './defaults.js';
import { PRINTER_WIDTH_PX } from './printer-protocol.js';
import {
  ditherRgbaToPng,
  pngBufferTo1BitRaster,
  type DitherAlgorithm,
  type RasterizeResult,
} from './rasterizer.js';
import {
  buildReceiptHtml,
  DEFAULT_DEMO_PHOTO_SVG_DATA_URL,
  type ReceiptFontProfile,
  type ReceiptStyle,
  type ReceiptTemplateKind,
} from './receipt-templates.js';

const DEFAULT_CHROME_PATHS = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter((p): p is string => Boolean(p));

const FONTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../assets/fonts',
);

const fontCache = new Map<string, Buffer>();
function loadFontBuffer(filename: string): Buffer | null {
  const safeName = path.basename(filename);
  if (fontCache.has(safeName)) return fontCache.get(safeName)!;
  const fullPath = path.join(FONTS_DIR, safeName);
  if (!fs.existsSync(fullPath)) return null;
  const buf = fs.readFileSync(fullPath);
  fontCache.set(safeName, buf);
  return buf;
}

let browserPromise: Promise<Browser> | null = null;
let shutdownHooksRegistered = false;

function resolveChromePath(): string {
  for (const candidate of DEFAULT_CHROME_PATHS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'Chrome executable not found; set CHROME_PATH or install Google Chrome',
  );
}

function registerShutdownHooks(): void {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;
  const cleanup = () => {
    void closeHtmlRenderer();
  };
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  process.once('beforeExit', cleanup);
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    registerShutdownHooks();
    browserPromise = puppeteer
      .launch({
        executablePath: resolveChromePath(),
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

export async function closeHtmlRenderer(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}

export interface PhotoPreprocessOptions {
  algorithm?: DitherAlgorithm;
  gamma?: number;
  threshold?: number;
  contrastStretch?: boolean;
  brightness?: number;
  targetWidth?: number;
}

export interface HtmlRenderRequest {
  template: ReceiptTemplateKind;
  style: ReceiptStyle;
  fontProfile?: ReceiptFontProfile;
  fontScale?: number;
  data?: unknown;
  gamma?: number;
  threshold?: number;
  algorithm?: DitherAlgorithm;
  hybrid?: boolean;
  photoOptions?: PhotoPreprocessOptions;
}

export interface HtmlRenderOutput {
  html: string;
  originalPng: Buffer;
  raster: RasterizeResult;
  renderMs: number;
}

/**
 * Decode and resize any browser-supported image (PNG/JPEG/WebP/SVG data URL)
 * to exact thermal pixel dimensions via Chrome canvas, then dither it to a
 * pure 0/255 PNG so it survives the final crisp-text thresholding untouched.
 */
async function preDitherImageDataUrl(
  page: Page,
  imageDataUrl: string,
  options: PhotoPreprocessOptions = {},
): Promise<string> {
  const targetWidth = options.targetWidth ?? 336;
  const decoded = await page.evaluate(
    async ({ src, maxW }) => {
      const img = new Image();
      img.src = src;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('failed to load image'));
      });
      const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
      const w = maxW;
      const h = Math.max(1, Math.min(720, Math.round(w * ratio)));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d context unavailable');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      return { width: w, height: h, data: Array.from(imageData.data) };
    },
    { src: imageDataUrl, maxW: targetWidth },
  );

  const ditheredPng = ditherRgbaToPng(
    new Uint8Array(decoded.data),
    decoded.width,
    decoded.height,
    {
      algorithm: options.algorithm ?? 'atkinson',
      gamma: options.gamma ?? 1.8,
      threshold: options.threshold ?? 128,
      contrastStretch: options.contrastStretch ?? true,
      brightness: options.brightness ?? 0,
    },
  );
  return 'data:image/png;base64,' + ditheredPng.toString('base64');
}

export async function renderHtmlToThermalRaster(
  req: HtmlRenderRequest,
): Promise<HtmlRenderOutput> {
  const startedAt = Date.now();
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('http://local.fonts/')) {
        const filename = url.slice('http://local.fonts/'.length);
        const buf = loadFontBuffer(filename);
        if (buf) {
          void request.respond({
            status: 200,
            contentType: 'font/otf',
            headers: { 'access-control-allow-origin': '*' },
            body: buf,
          });
          return;
        }
        void request.respond({ status: 404, body: 'font not found' });
        return;
      }
      void request.continue();
    });

    const fontProfile: ReceiptFontProfile = req.fontProfile ?? DEFAULT_FONT_PROFILE;
    const fontScale = req.fontScale ?? DEFAULT_FONT_SCALE;
    const rawData =
      req.data && typeof req.data === 'object'
        ? { ...(req.data as Record<string, unknown>) }
        : {};

    const hasPhoto =
      req.template === 'photo' ||
      (req.template === 'note' &&
        typeof rawData.imageDataUrl === 'string' &&
        rawData.imageDataUrl.length > 0);

    const useHybrid = req.hybrid ?? hasPhoto;

    // 1) Render original HTML first for side-by-side comparison.
    const originalHtml = buildReceiptHtml(
      req.template,
      req.style,
      rawData,
      fontProfile,
      fontScale,
    );

    await page.setViewport({
      width: PRINTER_WIDTH_PX,
      height: 200,
      deviceScaleFactor: 1,
    });
    await page.setContent(originalHtml, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const measuredHeight = await page.evaluate(() =>
      Math.max(1, Math.ceil(document.body.scrollHeight)),
    );
    await page.setViewport({
      width: PRINTER_WIDTH_PX,
      height: measuredHeight,
      deviceScaleFactor: 1,
    });
    const originalPng = Buffer.from(
      await page.screenshot({ type: 'png', fullPage: true }),
    );

    // 2) If Hybrid Rasterization is enabled for a template with an image,
    // pre-dither the image region independently and re-render with crisp text threshold.
    let rasterSourcePng = originalPng;
    let finalHtml = originalHtml;

    if (useHybrid && hasPhoto) {
      const srcUrl =
        typeof rawData.imageDataUrl === 'string' && rawData.imageDataUrl.length > 0
          ? rawData.imageDataUrl
          : DEFAULT_DEMO_PHOTO_SVG_DATA_URL;
      const ditheredUrl = await preDitherImageDataUrl(
        page,
        srcUrl,
        req.photoOptions,
      );
      const hybridData = { ...rawData, imageDataUrl: ditheredUrl };
      finalHtml = buildReceiptHtml(
        req.template,
        req.style,
        hybridData,
        fontProfile,
        fontScale,
      );
      await page.setContent(finalHtml, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const hybridHeight = await page.evaluate(() =>
        Math.max(1, Math.ceil(document.body.scrollHeight)),
      );
      await page.setViewport({
        width: PRINTER_WIDTH_PX,
        height: hybridHeight,
        deviceScaleFactor: 1,
      });
      rasterSourcePng = Buffer.from(
        await page.screenshot({ type: 'png', fullPage: true }),
      );
    }

    const raster = pngBufferTo1BitRaster(rasterSourcePng, {
      gamma: req.gamma ?? DEFAULT_GAMMA,
      threshold: req.threshold ?? DEFAULT_THRESHOLD,
      algorithm: req.algorithm ?? DEFAULT_ALGORITHM,
    });

    return {
      html: finalHtml,
      originalPng,
      raster,
      renderMs: Date.now() - startedAt,
    };
  } finally {
    await page.close();
  }
}

import type Database from 'better-sqlite3';
import { todayInShanghai } from './date.js';
import {
  renderHtmlToThermalRaster,
  type HtmlRenderOutput,
  type HtmlRenderRequest,
} from './html-renderer.js';
import { validateBitmapPayload } from './printer-protocol.js';
import {
  DeviceRegistry,
  PrintJobRepository,
  TodoRepository,
} from './repositories.js';
import type { PrintJob } from './types.js';

export type ThermalRenderer = (
  req: HtmlRenderRequest,
) => Promise<HtmlRenderOutput>;

export interface ClaimedPrintPayload {
  id: string;
  job: PrintJob;
  printer: {
    format: 'MONO_1BPP_MSB_FIRST';
    widthPx: 384;
    heightPx: number;
    bytesPerRow: 48;
    widthBytes: 48;
    height: number;
    bitmapB64: string;
    mode: 'RASTER_GS_V0';
  };
}

export class PrinterTodoService {
  readonly todos: TodoRepository;
  readonly printJobs: PrintJobRepository;
  readonly devices: DeviceRegistry;
  readonly renderer: ThermalRenderer;

  constructor(
    db: Database.Database,
    renderer: ThermalRenderer = renderHtmlToThermalRaster,
  ) {
    this.todos = new TodoRepository(db);
    this.printJobs = new PrintJobRepository(db);
    this.devices = new DeviceRegistry(db);
    this.renderer = renderer;
  }

  isPrinterReady(): boolean {
    const printer = this.devices.get('printer-01');
    return Boolean(
      printer &&
        printer.status === 'online' &&
        printer.paperStatus === 'ok' &&
        printer.coverOpen === false &&
        printer.printerError === false,
    );
  }

  async claimNextPrintJob(): Promise<ClaimedPrintPayload | null> {
    if (!this.isPrinterReady()) return null;
    const job = this.printJobs.claimNext();
    if (!job) return null;

    try {
      const data = { ...job.payload };
      if (job.template === 'todo' && !Array.isArray(data.items)) {
        const owner = typeof data.owner === 'string' ? data.owner : undefined;
        const items = this.todos
          .list(owner)
          .filter((t) => !t.completed)
          .map((t) => ({
          title: t.title,
          completed: t.completed,
          priority: t.priority,
          tag: t.tag ?? undefined,
        }));
        data.items = items;
        if (!data.date) data.date = todayInShanghai();
      }

      const rendered = await this.renderer({
        template: job.template,
        style: job.style,
        fontProfile: job.fontProfile,
        fontScale: job.renderOptions.fontScale,
        data,
        algorithm: job.renderOptions.algorithm,
        gamma: job.renderOptions.gamma,
        threshold: job.renderOptions.threshold,
        hybrid: job.renderOptions.hybrid,
        photoOptions: job.renderOptions.photoOptions,
      });

      validateBitmapPayload(rendered.raster.payload);

      return {
        id: job.id,
        job,
        printer: {
          ...rendered.raster.payload,
          widthBytes: rendered.raster.payload.bytesPerRow,
          height: rendered.raster.payload.heightPx,
          mode: 'RASTER_GS_V0',
        },
      };
    } catch (err) {
      this.printJobs.fail(
        job.id,
        err instanceof Error ? err.message : 'render failed',
        true,
      );
      throw err;
    }
  }
}

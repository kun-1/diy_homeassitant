import type Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { uptime as systemUptime } from 'node:os';
import type { Device, EInkArrangement, EInkState, Letter, PrinterPaperStatus } from './types.js';
import {
  createCalendarProvider,
  MockDeviceRegistry,
  MockLetterRepository,
  MockPrinterProvider,
  MockTodoRepository,
} from './repositories.js';
import type { CalendarProvider } from './repositories.js';
import {
  PRINTER_BYTES_PER_ROW,
  PRINTER_WIDTH_PX,
  validateBitmapPayload,
} from './printer-protocol.js';

const printerBytes = (value: string) => {
  try {
    return execFileSync('/usr/bin/iconv', ['-f', 'UTF-8', '-t', 'GBK'], { input: value });
  } catch {
    return Buffer.alloc(0);
  }
};
const renderCard = (letter: Letter) => {
  const script = new URL('../scripts/render-card.swift', import.meta.url);
  const raw = execFileSync('/usr/bin/swift', [script.pathname], { input: JSON.stringify(letter) });
  const width = raw.readUInt32LE(0),
    height = raw.readUInt32LE(4);
  const payload = {
    format: 'MONO_1BPP_MSB_FIRST' as const,
    widthPx: width as 384,
    heightPx: height,
    bytesPerRow: PRINTER_BYTES_PER_ROW as 48,
    bitmapB64: raw.subarray(8).toString('base64'),
  };
  if (width !== PRINTER_WIDTH_PX)
    throw new Error(`rendered bitmap width must be ${PRINTER_WIDTH_PX}px`);
  validateBitmapPayload(payload);
  return payload;
};
export class OfficeService {
  readonly calendar: CalendarProvider;
  readonly todos;
  readonly letters;
  readonly devices;
  readonly printer;
  constructor(
    private db: Database.Database,
    calendarProvider: 'mock' | 'google' = 'mock',
  ) {
    this.calendar = createCalendarProvider(db, calendarProvider);
    this.todos = new MockTodoRepository(db);
    this.letters = new MockLetterRepository(db);
    this.devices = new MockDeviceRegistry(db);
    this.printer = new MockPrinterProvider(db);
  }
  revision() {
    return Number(
      (
        this.db.prepare("SELECT value FROM eink_meta WHERE key='revision'").get() as {
          value: string;
        }
      ).value,
    );
  }
  bump() {
    this.db
      .prepare("UPDATE eink_meta SET value=CAST(value AS INTEGER)+1 WHERE key='revision'")
      .run();
  }
  einkConfig(): EInkArrangement {
    const row = this.db.prepare("SELECT value FROM eink_meta WHERE key='config'").get() as
      { value: string } | undefined;
    try {
      return JSON.parse(row?.value ?? '') as EInkArrangement;
    } catch {
      return { mode: 'summary', content: { schedule: true, todo: true, letters: true } };
    }
  }
  updateEinkConfig(value: EInkArrangement) {
    const old = this.einkConfig();
    if (JSON.stringify(old) !== JSON.stringify(value)) {
      this.db
        .prepare(
          "INSERT INTO eink_meta(key,value) VALUES ('config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(JSON.stringify(value));
      this.bump();
    }
    return this.einkConfig();
  }
  printerPaperOverride(): Exclude<PrinterPaperStatus, 'ok' | 'unknown'> | null {
    const row = this.db.prepare("SELECT value FROM eink_meta WHERE key='printer_paper_override'").get() as
      | { value: string }
      | undefined;
    return row?.value === 'out' || row?.value === 'near_end' ? row.value : null;
  }
  updatePrinterPaperOverride(value: Exclude<PrinterPaperStatus, 'ok' | 'unknown'> | null) {
    const old = this.printerPaperOverride();
    if (value === null) {
      this.db.prepare("DELETE FROM eink_meta WHERE key='printer_paper_override'").run();
    } else {
      this.db
        .prepare(
          "INSERT INTO eink_meta(key,value) VALUES ('printer_paper_override',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(value);
    }
    if (old !== value) this.bump();
    return this.deviceList().find((device) => device.id === 'printer-01') ?? null;
  }
  macMiniStatus() {
    const device = this.deviceList().find((item) => item.kind === 'macmini');
    if (!device) return null;
    const dataUpdatedAt = (this.db.prepare(`SELECT MAX(value) AS value FROM (
      SELECT MAX(updated_at) AS value FROM devices
      UNION ALL SELECT MAX(updated_at) AS value FROM todos
      UNION ALL SELECT MAX(updated_at) AS value FROM calendar_events
      UNION ALL SELECT MAX(updated_at) AS value FROM letters
      UNION ALL SELECT MAX(COALESCE(completed_at, created_at)) AS value FROM print_jobs
    )`).get() as { value: string | null }).value;
    return {
      id: device.id,
      name: device.name,
      status: device.status,
      lastConnectedAt: device.lastSeenAt,
      dataUpdatedAt,
      serviceStatus: { pwa: 'ok' as const, api: 'ok' as const },
      uptimeSeconds: Math.floor(systemUptime()),
      revision: this.revision(),
      source: 'real_mac_mini' as const,
      generatedAt: new Date().toISOString(),
    };
  }
  deviceList(): Device[] {
    const paperOverride = this.printerPaperOverride();
    return this.devices.list().map((device) => {
      if (device.id !== 'printer-01' || !paperOverride) return device;

      // A fresh hardware report is authoritative. The persisted override is
      // only a fail-safe while the printer is offline or its paper sensor is
      // unavailable, so inserting paper automatically recovers to \`ok\` on the
      // next heartbeat without requiring a manual reset.
      const hasFreshPaperReport =
        device.status === 'online' &&
        device.paperStatus !== null &&
        device.paperStatus !== 'unknown';
      return hasFreshPaperReport ? device : { ...device, paperStatus: paperOverride };
    });
  }
  state(): EInkState {
    if (this.devices.syncStatuses()) this.bump();
    return {
      revision: this.revision(),
      generatedAt: new Date().toISOString(),
      config: this.einkConfig(),
      unreadLetterCount: this.letters.list().filter((x) => x.unread).length,
      calendarEvents: this.calendar.list(),
      // Completed items remain available from /api/todos for history and
      // undo, but no longer consume the limited Today/E-ink display area.
      todos: this.todos.list().filter((x) => !x.completed),
      devices: this.deviceList()
        .map(
          ({
            id,
            name,
            kind,
            status,
            statusSource,
            statusReason,
            lastSeenAt,
            batteryPct,
            paperStatus,
            coverOpen,
            printerError,
          }) => ({
            id,
            name,
            kind,
            status,
            statusSource,
            statusReason,
            lastSeenAt,
            batteryPct,
            paperStatus,
            coverOpen,
            printerError,
          }),
        ),
    };
  }
  claimPrint() {
    const printerDevice = this.deviceList().find((device) => device.id === 'printer-01');
    if (
      !printerDevice ||
      printerDevice.status !== 'online' ||
      printerDevice.paperStatus !== 'ok' ||
      printerDevice.coverOpen !== false ||
      printerDevice.printerError !== false
    ) {
      return null;
    }
    const job = this.printer.claimNext();
    const letter = job ? this.letters.get((job as { letterId: string }).letterId) : null;
    if (!job || !letter) return null;
    const bitmap = renderCard(letter);
    return {
      job,
      letter,
      printer: {
        ...bitmap,
        widthBytes: bitmap.bytesPerRow,
        height: bitmap.heightPx,
        titleB64: printerBytes(letter.title).toString('base64'),
        bodyB64: printerBytes(letter.body).toString('base64'),
        signatureB64: printerBytes(letter.signature).toString('base64'),
        encoding: 'GBK',
        chineseMode: 'FS_AMPERSAND',
        mode: 'RASTER_GS_V0',
      },
    };
  }
  completePrint(id: string) {
    const value = this.printer.complete(id);
    if (value) this.bump();
    return value;
  }
  failPrint(id: string, error: string, retryable = true) {
    const value = this.printer.fail(id, error, retryable);
    if (value) this.bump();
    return value;
  }
  retryPrint(id: string) {
    const value = this.printer.retry(id);
    if (value) this.bump();
    return value;
  }
}

import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { openDb } from '../src/db.js';

const deviceRows = [
  ['macmini-01', 'Mac mini', 'macmini'],
  ['esp32-01', 'ESP32-S3', 'esp32'],
  ['eink-01', 'Desk E-ink', 'eink'],
  ['printer-01', 'EM5823H', 'printer'],
  ['powerbank-01', 'Waveshare UPS 3S', 'powerBank'],
] as const;

function seededDbPath() {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'office-devices-')), 'test.sqlite');
  const db = openDb(dbPath);
  const stamp = new Date().toISOString();
  for (const [id, name, kind] of deviceRows) {
    db.prepare(
      "INSERT INTO devices (id,name,kind,status,last_seen_at,battery_pct,updated_at) VALUES (?,?,?,'offline',NULL,NULL,?)",
    ).run(id, name, kind, stamp);
  }
  db.close();
  return dbPath;
}

async function buildPrinterReadyApp() {
  const app = buildApp(seededDbPath());
  const heartbeat = await app.inject({
    method: 'POST',
    url: '/api/devices/printer-01/heartbeat',
    payload: {
      batteryPct: null,
      paperStatus: 'ok',
      coverOpen: false,
      printerError: false,
    },
  });
  expect(heartbeat.statusCode).toBe(200);
  return app;
}

describe('Office Companion API', () => {
  it('keeps the E-ink ETag contract stable', async () => {
    const app = buildApp();
    const health = await app.inject('/api/health');
    expect(health.statusCode).toBe(200);
    const first = await app.inject('/api/eink/state');
    expect(first.statusCode).toBe(200);
    const unchanged = await app.inject({
      method: 'GET',
      url: '/api/eink/state',
      headers: { 'if-none-match': first.headers.etag },
    });
    expect(unchanged.statusCode).toBe(304);
  });

  it('keeps completed todos in history but removes them from Today and E-ink', async () => {
    const app = buildApp();
    const pending = JSON.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/todos',
          payload: { title: '还要完成', completed: false, dueDate: null },
        })
      ).body,
    );
    const completed = JSON.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/todos',
          payload: { title: '已经完成', completed: true, dueDate: null },
        })
      ).body,
    );

    const history = JSON.parse((await app.inject('/api/todos')).body) as Array<{ id: string }>;
    expect(history.map((item) => item.id)).toEqual(
      expect.arrayContaining([pending.id, completed.id]),
    );

    const eink = JSON.parse((await app.inject('/api/eink/state')).body) as {
      todos: Array<{ id: string }>;
    };
    const today = JSON.parse((await app.inject('/api/today')).body) as {
      todos: Array<{ id: string }>;
    };
    expect(eink.todos.map((item) => item.id)).toEqual([pending.id]);
    expect(today.todos.map((item) => item.id)).toEqual([pending.id]);
  });

  it('persists E-ink arrangement and bumps revision only when it changes', async () => {
    const app = buildApp();
    const before = JSON.parse((await app.inject('/api/eink/state')).body);
    expect(before.config).toEqual({
      mode: 'birds',
      content: { schedule: false, todo: false, letters: false },
    });
    const changed = await app.inject({
      method: 'PATCH',
      url: '/api/eink/config',
      payload: { mode: 'letters', content: { schedule: false, todo: false, letters: true } },
    });
    expect(changed.statusCode).toBe(200);
    const after = JSON.parse((await app.inject('/api/eink/state')).body);
    expect(after.config.mode).toBe('letters');
    expect(after.revision).toBe(before.revision + 1);
    await app.inject({ method: 'PATCH', url: '/api/eink/config', payload: after.config });
    const unchanged = JSON.parse((await app.inject('/api/eink/state')).body);
    expect(unchanged.revision).toBe(after.revision);
  });

  it('keeps letters and print completion in the E-ink revision flow', async () => {
    const app = await buildPrinterReadyApp();
    const before = JSON.parse((await app.inject('/api/eink/state')).body);
    const letter = await app.inject({
      method: 'POST',
      url: '/api/letters',
      payload: { title: 'T', body: 'B', signature: 'S', paper: 'receipt' },
    });
    expect(JSON.parse(letter.body).paper).toBe('receipt');
    const listedLetter = JSON.parse((await app.inject('/api/letters')).body).find(
      (item: { id: string }) => item.id === JSON.parse(letter.body).id,
    );
    expect(listedLetter.paper).toBe('receipt');
    const after = JSON.parse((await app.inject('/api/eink/state')).body);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.unreadLetterCount).toBe(before.unreadLetterCount + 1);
    const job = await app.inject({
      method: 'POST',
      url: '/api/print/jobs',
      payload: { letterId: JSON.parse(letter.body).id },
    });
    const jobId = JSON.parse(job.body).id;
    expect(
      (await app.inject({ method: 'POST', url: `/api/print/jobs/${jobId}/complete` })).statusCode,
    ).toBe(409);
    await app.inject('/api/print/jobs/next');
    const done = await app.inject({ method: 'POST', url: `/api/print/jobs/${jobId}/complete` });
    expect(done.statusCode).toBe(200);
    const end = JSON.parse((await app.inject('/api/eink/state')).body);
    expect(end.unreadLetterCount).toBe(before.unreadLetterCount);
  });
  it('claims the oldest queued letter with its content exactly once', async () => {
    const app = await buildPrinterReadyApp();
    const letter = await app.inject({
      method: 'POST',
      url: '/api/letters',
      payload: { title: '打印测试', body: 'hello', signature: 'Guozi' },
    });
    const letterId = JSON.parse(letter.body).id;
    await app.inject({ method: 'POST', url: '/api/print/jobs', payload: { letterId } });
    const claimed = await app.inject('/api/print/jobs/next');
    expect(claimed.statusCode).toBe(200);
    expect(JSON.parse(claimed.body).letter.body).toBe('hello');
    expect(JSON.parse(claimed.body).job.status).toBe('printing');
    expect((await app.inject('/api/print/jobs/next')).statusCode).toBe(204);
  });

  it('exposes a validated 384px bitmap payload and protects state transitions', async () => {
    const app = await buildPrinterReadyApp();
    const letter = await app.inject({
      method: 'POST',
      url: '/api/letters',
      payload: { title: '位图', body: 'payload', signature: 'test' },
    });
    const letterId = JSON.parse(letter.body).id;
    const created = await app.inject({
      method: 'POST',
      url: '/api/print/jobs',
      payload: { letterId },
    });
    const jobId = JSON.parse(created.body).id;
    const claimed = JSON.parse((await app.inject('/api/print/jobs/next')).body);
    expect(claimed.job).toMatchObject({
      id: jobId,
      status: 'printing',
      attempts: 0,
      maxAttempts: 3,
    });
    expect(claimed.printer).toMatchObject({
      format: 'MONO_1BPP_MSB_FIRST',
      widthPx: 384,
      heightPx: 480,
      bytesPerRow: 48,
    });
    expect(Buffer.from(claimed.printer.bitmapB64, 'base64')).toHaveLength(480 * 48);
    expect((await app.inject('/api/print/jobs/next')).statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'POST', url: `/api/print/jobs/${jobId}/complete` })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: `/api/print/jobs/${jobId}/complete` })).statusCode,
    ).toBe(409);
  });

  it('persists every PWA letter choice and renders distinct thermal cards', async () => {
    const app = await buildPrinterReadyApp();
    const papers = ['border', 'emoji', 'receipt', 'minimal'] as const;
    const contentCases = [
      { content: 'none' },
      {
        content: 'polaroid',
        imageData:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      },
      { content: 'coupon', coupon: { name: '晚餐券', code: 'LOVE-01', expiry: '2026-12-31' } },
      { content: 'ghost-stamp', ghostEmoji: '!' },
      { content: 'prescription', prescription: ['喝水', '早点睡'] },
    ] as const;
    const cases = papers.flatMap((paper) => contentCases.map((metadata) => ({ paper, metadata })));
    const hashes = new Set<string>();
    for (const [index, item] of cases.entries()) {
      const created = await app.inject({
        method: 'POST',
        url: '/api/letters',
        payload: {
          title: `卡片 ${index}`,
          body: '今天也要好好生活',
          signature: '我们的小日常',
          ...item,
        },
      });
      expect(created.statusCode).toBe(201);
      const saved = JSON.parse(created.body);
      expect(saved.metadata).toEqual(item.metadata);
      await app.inject({ method: 'POST', url: '/api/print/jobs', payload: { letterId: saved.id } });
      const claimed = JSON.parse((await app.inject('/api/print/jobs/next')).body);
      expect(claimed.letter.metadata).toEqual(item.metadata);
      const bytes = Buffer.from(claimed.printer.bitmapB64, 'base64');
      expect(bytes).toHaveLength(480 * 48);
      if (index === 0) {
        const countInk = (chunk: Buffer) =>
          [...chunk].reduce(
            (total, byte) => total + byte.toString(2).replaceAll('0', '').length,
            0,
          );
        const topInk = countInk(bytes.subarray(0, 240 * 48));
        const bottomInk = countInk(bytes.subarray(240 * 48));
        expect(topInk).toBeGreaterThan(bottomInk);
      }
      hashes.add(createHash('sha256').update(bytes).digest('hex'));
    }
    expect(hashes.size).toBe(cases.length);
  }, 40_000);

  it('requeues the first two failures and makes the third failure terminal', async () => {
    const app = await buildPrinterReadyApp();
    const letter = await app.inject({
      method: 'POST',
      url: '/api/letters',
      payload: { title: 'retry', body: 'x', signature: 'test' },
    });
    const letterId = JSON.parse(letter.body).id;
    const created = await app.inject({
      method: 'POST',
      url: '/api/print/jobs',
      payload: { letterId },
    });
    const jobId = JSON.parse(created.body).id;
    for (const expectedStatus of ['queued', 'queued', 'failed']) {
      await app.inject('/api/print/jobs/next');
      const failed = await app.inject({
        method: 'POST',
        url: `/api/print/jobs/${jobId}/fail`,
        payload: { error: 'mock transport unavailable' },
      });
      expect(failed.statusCode).toBe(200);
      expect(JSON.parse(failed.body)).toMatchObject({ status: expectedStatus });
    }
    const terminal = await app.inject({ method: 'POST', url: `/api/print/jobs/${jobId}/retry` });
    expect(terminal.statusCode).toBe(409);
    expect(JSON.parse(terminal.body).code).toBe('PRINT_JOB_RETRY_EXHAUSTED');
  }, 15_000);

  it('never automatically retries an interrupted raster frame', async () => {
    const app = await buildPrinterReadyApp();
    const letter = await app.inject({
      method: 'POST',
      url: '/api/letters',
      payload: { title: 'raster', body: 'x', signature: 'test' },
    });
    const created = await app.inject({
      method: 'POST',
      url: '/api/print/jobs',
      payload: { letterId: JSON.parse(letter.body).id },
    });
    const jobId = JSON.parse(created.body).id;
    await app.inject('/api/print/jobs/next');
    const failed = await app.inject({
      method: 'POST',
      url: `/api/print/jobs/${jobId}/fail`,
      payload: { error: 'partial GS v 0 frame', retryable: false },
    });
    expect(failed.statusCode).toBe(200);
    expect(JSON.parse(failed.body)).toMatchObject({
      status: 'failed',
      attempts: 3,
      maxAttempts: 3,
      error: 'partial GS v 0 frame',
    });
    expect((await app.inject('/api/print/jobs/next')).statusCode).toBe(204);
  });

  it('automatically recovers from a manual out-of-paper state after hardware reports paper present', async () => {
    const app = buildApp(seededDbPath());
    await app.inject({
      method: 'POST',
      url: '/api/devices/printer-01/heartbeat',
      payload: {
        batteryPct: null,
        paperStatus: 'ok',
        coverOpen: false,
        printerError: false,
      },
    });
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/devices/printer-01/paper',
          payload: { paperStatus: 'out' },
        })
      ).statusCode,
    ).toBe(200);
    // Once the printer reports a fresh hardware state, it is authoritative.
    // Reinstalling paper therefore clears the effective out-of-paper state.
    await app.inject({
      method: 'POST',
      url: '/api/devices/printer-01/heartbeat',
      payload: {
        batteryPct: null,
        paperStatus: 'ok',
        coverOpen: false,
        printerError: false,
      },
    });
    expect(
      JSON.parse((await app.inject('/api/devices')).body).find(
        (device: { id: string }) => device.id === 'printer-01',
      ).paperStatus,
    ).toBe('ok');
    const letter = await app.inject({
      method: 'POST',
      url: '/api/letters',
      payload: { title: 'paper recovered', body: 'ready to print', signature: 'test' },
    });
    const job = await app.inject({
      method: 'POST',
      url: '/api/print/jobs',
      payload: { letterId: JSON.parse(letter.body).id },
    });
    expect((await app.inject('/api/print/jobs/next')).statusCode).toBe(200);
    expect(
      JSON.parse((await app.inject(`/api/print/jobs/${JSON.parse(job.body).id}`)).body).status,
    ).toBe('printing');
  });

  it('makes missing and stale printer reports explicit unknown/null values', async () => {
    const app = buildApp(seededDbPath());
    const initial = JSON.parse((await app.inject('/api/devices')).body).find(
      (device: { kind: string }) => device.kind === 'printer',
    );
    expect(initial).toMatchObject({
      status: 'offline',
      statusSource: 'direct',
      paperStatus: null,
      coverOpen: null,
      printerError: null,
      batteryPct: null,
    });
    const heartbeat = await app.inject({
      method: 'POST',
      url: '/api/devices/printer-01/heartbeat',
      payload: { batteryPct: null },
    });
    expect(heartbeat.statusCode).toBe(200);
    const fresh = JSON.parse((await app.inject('/api/devices')).body).find(
      (device: { kind: string }) => device.kind === 'printer',
    );
    expect(fresh).toMatchObject({
      status: 'online',
      statusSource: 'direct',
      paperStatus: 'unknown',
      coverOpen: null,
      printerError: null,
    });
  });

  it('keeps calendar changes visible through E-ink revision', async () => {
    const app = buildApp();
    const before = JSON.parse((await app.inject('/api/eink/state')).body);
    await app.inject({
      method: 'POST',
      url: '/api/calendar/events',
      payload: {
        title: 'X',
        startsAt: '2026-08-16T10:00:00.000Z',
        endsAt: '2026-08-16T11:00:00.000Z',
      },
    });
    const after = JSON.parse((await app.inject('/api/eink/state')).body);
    expect(after.revision).toBe(before.revision + 1);
  });

  it('derives E-ink reachability from ESP32 and never invents battery', async () => {
    const app = buildApp(seededDbPath());
    const initial = JSON.parse((await app.inject('/api/devices')).body);
    expect(
      initial.every((device: { batteryPct: number | null }) => device.batteryPct === null),
    ).toBe(true);

    const heartbeat = await app.inject({
      method: 'POST',
      url: '/api/devices/esp32-01/heartbeat',
      payload: { batteryPct: null, powerBankPct: 86 },
    });
    expect(heartbeat.statusCode).toBe(200);
    const devices = JSON.parse((await app.inject('/api/devices')).body);
    const esp32 = devices.find((device: { kind: string }) => device.kind === 'esp32');
    const eink = devices.find((device: { kind: string }) => device.kind === 'eink');
    expect(esp32.status).toBe('online');
    expect(esp32.statusSource).toBe('direct');
    expect(esp32.statusReason).toBe('direct_heartbeat');
    expect(eink.status).toBe('online');
    expect(eink.statusSource).toBe('derived');
    expect(eink.statusReason).toBe('derived_from_esp32');
    expect(eink.lastSeenAt).toBe(esp32.lastSeenAt);
    expect(eink.batteryPct).toBeNull();
    const powerBankFromEsp32 = devices.find(
      (device: { kind: string }) => device.kind === 'powerBank',
    );
    expect(powerBankFromEsp32).toMatchObject({ status: 'online', batteryPct: 86 });

    const printer = await app.inject({
      method: 'POST',
      url: '/api/devices/printer-01/heartbeat',
      payload: { batteryPct: null },
    });
    const powerBank = await app.inject({
      method: 'POST',
      url: '/api/devices/powerbank-01/heartbeat',
      payload: { batteryPct: 42 },
    });
    expect(printer.statusCode).toBe(200);
    expect(powerBank.statusCode).toBe(200);
    const directDevices = JSON.parse((await app.inject('/api/devices')).body);
    expect(
      directDevices.find((device: { kind: string }) => device.kind === 'printer').statusSource,
    ).toBe('direct');
    expect(
      directDevices.find((device: { kind: string }) => device.kind === 'powerBank').batteryPct,
    ).toBe(42);

    const einkHeartbeat = await app.inject({
      method: 'POST',
      url: '/api/devices/eink-01/heartbeat',
      payload: { batteryPct: 50 },
    });
    expect(einkHeartbeat.statusCode).toBe(409);
    expect(JSON.parse(einkHeartbeat.body).code).toBe('EINK_HEARTBEAT_NOT_SUPPORTED');
  });

  it('publishes the same device semantics from /api/today', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('weather unavailable')));
    try {
      const app = buildApp(seededDbPath());
      const today = JSON.parse((await app.inject('/api/today')).body);
      expect(today.devices).toHaveLength(5);
      expect(
        today.devices.find((device: { kind: string }) => device.kind === 'eink'),
      ).toMatchObject({ status: 'offline', statusSource: 'derived', batteryPct: null });
      expect(
        today.devices.every((device: { batteryPct: number | null }) => device.batteryPct === null),
      ).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('bumps revision when a direct heartbeat expires', async () => {
    const dbPath = seededDbPath();
    const app = buildApp(dbPath);
    await app.inject({
      method: 'POST',
      url: '/api/devices/esp32-01/heartbeat',
      payload: { batteryPct: null },
    });
    const online = JSON.parse((await app.inject('/api/eink/state')).body);
    expect(online.devices.find((device: { kind: string }) => device.kind === 'eink').status).toBe(
      'online',
    );

    // Age the heartbeat directly so the test does not freeze Fastify's async scheduler.
    const db = openDb(dbPath);
    db.prepare('UPDATE devices SET last_seen_at=? WHERE id=?').run(
      new Date(Date.now() - 90_001).toISOString(),
      'esp32-01',
    );
    db.close();

    const offline = JSON.parse((await app.inject('/api/eink/state')).body);
    expect(offline.revision).toBeGreaterThan(online.revision);
    expect(offline.devices.find((device: { kind: string }) => device.kind === 'esp32').status).toBe(
      'offline',
    );
    expect(offline.devices.find((device: { kind: string }) => device.kind === 'eink').status).toBe(
      'offline',
    );
  });
});

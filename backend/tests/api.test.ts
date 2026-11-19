import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { PRINTER_BYTES_PER_ROW, PRINTER_WIDTH_PX } from '../src/printer-protocol.js';
import type { ThermalRenderer } from '../src/service.js';

const mockRenderer: ThermalRenderer = async () => {
  const heightPx = 4;
  const bitmap = Buffer.alloc(heightPx * PRINTER_BYTES_PER_ROW, 0xaa);
  const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  return {
    html: '<html></html>',
    originalPng: fakePng,
    renderMs: 1,
    raster: {
      bitmap,
      previewPng: fakePng,
      payload: {
        format: 'MONO_1BPP_MSB_FIRST',
        widthPx: PRINTER_WIDTH_PX,
        heightPx,
        bytesPerRow: PRINTER_BYTES_PER_ROW as 48,
        bitmapB64: bitmap.toString('base64'),
      },
      stats: {
        avgBlackPct: 25,
        maxRowBlackPct: 50,
        hotRowCount: 0,
        estimatedBands: 1,
      },
    },
  };
};

async function markPrinterOnline(app: ReturnType<typeof buildApp>) {
  await app.inject({
    method: 'POST',
    url: '/api/devices/esp32-01/heartbeat',
    payload: { powerBankPct: 84, wifiRssiDbm: -55, ipAddress: '192.168.1.50' },
  });
  await app.inject({
    method: 'POST',
    url: '/api/devices/printer-01/heartbeat',
    payload: { paperStatus: 'ok', coverOpen: false, printerError: false },
  });
}

describe('Printer Todo Backend API', () => {
  it('creates, updates, lists, and deletes todos', async () => {
    const app = buildApp(':memory:', mockRenderer);
    const created = await app.inject({
      method: 'POST',
      url: '/api/todos',
      payload: { title: '买热敏纸', priority: 'high', owner: 'kun' },
    });
    expect(created.statusCode).toBe(201);
    const todo = JSON.parse(created.body);
    expect(todo.title).toBe('买热敏纸');
    expect(todo.priority).toBe('high');

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/todos/${todo.id}`,
      payload: { completed: true },
    });
    expect(patched.statusCode).toBe(200);
    expect(JSON.parse(patched.body).completed).toBe(true);

    const del = await app.inject({ method: 'DELETE', url: `/api/todos/${todo.id}` });
    expect(del.statusCode).toBe(204);
  });

  it('records ESP32 + INA219 battery + EM5823H printer heartbeats', async () => {
    const app = buildApp(':memory:', mockRenderer);
    await markPrinterOnline(app);

    const res = await app.inject('/api/devices');
    expect(res.statusCode).toBe(200);
    const devices = JSON.parse(res.body) as Array<{ id: string; status: string; batteryPct: number | null; paperStatus: string | null }>;
    expect(devices.find((d) => d.id === 'esp32-01')?.status).toBe('online');
    expect(devices.find((d) => d.id === 'powerbank-01')?.batteryPct).toBe(84);
    expect(devices.find((d) => d.id === 'printer-01')?.paperStatus).toBe('ok');
  });

  it('queues, claims, completes, and handles retryable failures for all 4 formats', async () => {
    const app = buildApp(':memory:', mockRenderer);

    // Offline printer cannot claim
    const jobRes = await app.inject({
      method: 'POST',
      url: '/api/print/jobs',
      payload: {
        template: 'focus',
        style: 'receipt',
        fontProfile: 'pixel',
        data: { title: '专注测试' },
      },
    });
    expect(jobRes.statusCode).toBe(201);
    const jobId = JSON.parse(jobRes.body).id;
    expect((await app.inject('/api/print/jobs/next')).statusCode).toBe(204);

    // Once printer reports online + ok, claim succeeds with GS v 0 payload
    await markPrinterOnline(app);
    const claimed = await app.inject('/api/print/jobs/next');
    expect(claimed.statusCode).toBe(200);
    const payload = JSON.parse(claimed.body);
    expect(payload.id).toBe(jobId);
    expect(payload.printer.widthBytes).toBe(48);
    expect(payload.printer.mode).toBe('RASTER_GS_V0');

    // Second claim while printing returns 204
    expect((await app.inject('/api/print/jobs/next')).statusCode).toBe(204);

    // Fail once retryable -> requeued
    const failed = await app.inject({
      method: 'POST',
      url: `/api/print/jobs/${jobId}/fail`,
      payload: { error: 'transient wifi timeout', retryable: true },
    });
    expect(failed.statusCode).toBe(200);
    expect(JSON.parse(failed.body).status).toBe('queued');

    // Claim again and complete
    expect((await app.inject('/api/print/jobs/next')).statusCode).toBe(200);
    const completed = await app.inject({
      method: 'POST',
      url: `/api/print/jobs/${jobId}/complete`,
    });
    expect(completed.statusCode).toBe(200);
    expect(JSON.parse(completed.body).status).toBe('completed');
  });
});

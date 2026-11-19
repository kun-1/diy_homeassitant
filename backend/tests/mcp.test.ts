import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { PRINTER_BYTES_PER_ROW, PRINTER_WIDTH_PX } from '../src/printer-protocol.js';
import type { ThermalRenderer } from '../src/service.js';

const TOKEN = 'test-token-123';

const renderer: ThermalRenderer = async () => {
  const bitmap = Buffer.alloc(4 * PRINTER_BYTES_PER_ROW);
  const png = Buffer.from([0x89]);
  return {
    html: '',
    originalPng: png,
    renderMs: 1,
    raster: {
      bitmap,
      previewPng: png,
      payload: {
        format: 'MONO_1BPP_MSB_FIRST',
        widthPx: PRINTER_WIDTH_PX,
        heightPx: 4,
        bytesPerRow: PRINTER_BYTES_PER_ROW as 48,
        bitmapB64: bitmap.toString('base64'),
      },
      stats: { avgBlackPct: 0, maxRowBlackPct: 0, hotRowCount: 0, estimatedBands: 1 },
    },
  };
};

const rpc = (id: number, method: string, params: unknown = {}) =>
  JSON.stringify({ jsonrpc: '2.0', id, method, params });

describe('MCP endpoint', () => {
  const app = buildApp(':memory:', renderer);
  let base = '';

  beforeAll(async () => {
    process.env.MCP_TOKEN = TOKEN;
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  });
  afterAll(async () => {
    await app.close();
    delete process.env.MCP_TOKEN;
  });

  const call = (body: string, token: string | null = TOKEN) =>
    fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body,
    });

  const parse = async (res: Response) => {
    const raw = await res.text();
    const line = raw.split('\n').find((l) => l.startsWith('data:'));
    return JSON.parse(line ? line.slice(5) : raw);
  };

  it('rejects missing or wrong bearer tokens', async () => {
    expect((await call(rpc(1, 'tools/list'), null)).status).toBe(401);
    expect((await call(rpc(1, 'tools/list'), 'nope')).status).toBe(401);
  });

  it('lists the five printing tools', async () => {
    const res = await call(rpc(1, 'tools/list'));
    expect(res.status).toBe(200);
    const json = await parse(res);
    const names = json.result.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual([
      'add_and_print_todo',
      'get_printer_status',
      'print_couple_note',
      'print_daily_todo',
      'print_photo_card',
    ]);
  });

  it('queues a note job through tools/call', async () => {
    const res = await call(
      rpc(2, 'tools/call', { name: 'print_couple_note', arguments: { body: '记得喝水', from: 'Kun' } }),
    );
    const json = await parse(res);
    expect(json.result.isError).toBeFalsy();
    const jobs = (await (await fetch(`${base}/api/print/jobs`)).json()) as Array<{ template: string; status: string }>;
    expect(jobs.some((j) => j.template === 'note' && j.status === 'queued')).toBe(true);
  });

  it('saves a todo and queues a focus ticket', async () => {
    const res = await call(
      rpc(3, 'tools/call', { name: 'add_and_print_todo', arguments: { title: '买热敏纸' } }),
    );
    const json = await parse(res);
    expect(json.result.isError).toBeFalsy();
    const todos = (await (await fetch(`${base}/api/todos`)).json()) as Array<{ title: string }>;
    expect(todos.some((t) => t.title === '买热敏纸')).toBe(true);
  });

  it('refuses private-network image URLs', async () => {
    const res = await call(
      rpc(4, 'tools/call', { name: 'print_photo_card', arguments: { imageUrl: 'http://127.0.0.1:3100/x.png' } }),
    );
    const json = await parse(res);
    expect(json.result.isError).toBe(true);
  });
});

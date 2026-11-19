import cors from '@fastify/cors';
import Fastify from 'fastify';
import { z } from 'zod';
import { openDb } from './db.js';
import { DEBUG_PRINTER_HTML } from './debug-printer-ui.js';
import { registerMcp } from './mcp.js';
import { registerOAuth } from './oauth.js';
import {
  heartbeatSchema,
  idParam,
  printerPreviewSchema,
  printJobCreate,
  printJobFail,
  todoCreate,
  todoPatch,
} from './schemas.js';
import { PrinterTodoService, type ThermalRenderer } from './service.js';

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw Object.assign(new Error('validation failed'), {
      statusCode: 400,
      details: result.error.flatten(),
    });
  }
  return result.data;
}

export function buildApp(dbPath = ':memory:', renderer?: ThermalRenderer) {
  const app = Fastify({ logger: false });
  const svc = new PrinterTodoService(openDb(dbPath), renderer);

  app.register(cors);
  app.setErrorHandler((err, _req, res) => {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    return res.status(statusCode).send({
      error: (err as Error).message,
      code: (err as { code?: string }).code,
      details: (err as { details?: unknown }).details,
    });
  });

  // Health
  app.get('/api/health', () => ({
    status: 'ok',
    printerReady: svc.isPrinterReady(),
    queuedJobs: svc.printJobs.list(100).filter((j) => j.status === 'queued').length,
  }));

  // Todos
  app.get('/api/todos', (req) => {
    const owner = (req.query as { owner?: string }).owner;
    return svc.todos.list(owner);
  });

  app.post('/api/todos', (req, res) => {
    const body = parseOrThrow(todoCreate, req.body);
    return res.code(201).send(svc.todos.create(body));
  });

  app.patch('/api/todos/:id', (req, res) => {
    const { id } = parseOrThrow(idParam, req.params);
    const body = parseOrThrow(todoPatch, req.body);
    const updated = svc.todos.update(id, body);
    return updated ?? res.code(404).send({ error: 'todo not found' });
  });

  app.delete('/api/todos/:id', (req, res) => {
    const { id } = parseOrThrow(idParam, req.params);
    if (!svc.todos.delete(id)) {
      return res.code(404).send({ error: 'todo not found' });
    }
    return res.code(204).send();
  });

  // Print queue
  app.get('/api/print/jobs', () => svc.printJobs.list());

  app.post('/api/print/jobs', { bodyLimit: 8 * 1024 * 1024 }, (req, res) => {
    const body = parseOrThrow(printJobCreate, req.body);
    const job = svc.printJobs.create({
      template: body.template,
      style: body.style,
      fontProfile: body.fontProfile,
      payload: body.data,
      renderOptions: body.renderOptions,
    });
    return res.code(201).send(job);
  });

  app.get('/api/print/jobs/next', async (_req, res) => {
    const claimed = await svc.claimNextPrintJob();
    return claimed ?? res.code(204).send();
  });

  app.get('/api/print/jobs/:id', (req, res) => {
    const { id } = parseOrThrow(idParam, req.params);
    const job = svc.printJobs.get(id);
    return job ?? res.code(404).send({ error: 'print job not found' });
  });

  app.post('/api/print/jobs/:id/complete', (req, res) => {
    const { id } = parseOrThrow(idParam, req.params);
    const before = svc.printJobs.get(id);
    if (!before) return res.code(404).send({ error: 'print job not found' });
    if (before.status !== 'printing') {
      return res.code(409).send({
        error: 'print job must be printing before completion',
        code: 'PRINT_JOB_INVALID_TRANSITION',
        status: before.status,
      });
    }
    return svc.printJobs.complete(id);
  });

  app.post('/api/print/jobs/:id/fail', (req, res) => {
    const { id } = parseOrThrow(idParam, req.params);
    const body = parseOrThrow(printJobFail, req.body);
    const before = svc.printJobs.get(id);
    if (!before) return res.code(404).send({ error: 'print job not found' });
    if (before.status !== 'printing') {
      return res.code(409).send({
        error: 'print job must be printing before failure',
        code: 'PRINT_JOB_INVALID_TRANSITION',
        status: before.status,
      });
    }
    return svc.printJobs.fail(id, body.error, body.retryable);
  });

  app.post('/api/print/jobs/:id/retry', (req, res) => {
    const { id } = parseOrThrow(idParam, req.params);
    const before = svc.printJobs.get(id);
    if (!before) return res.code(404).send({ error: 'print job not found' });
    const retried = svc.printJobs.retry(id);
    if (!retried || retried.status !== 'queued') {
      return res.code(409).send({
        error: 'print job retry limit reached or job is not failed',
        code: 'PRINT_JOB_RETRY_EXHAUSTED',
        status: retried?.status,
      });
    }
    return retried;
  });

  // Devices & battery heartbeat
  app.get('/api/devices', () => svc.devices.list());

  app.post('/api/devices/:id/heartbeat', (req, res) => {
    const { id } = parseOrThrow(idParam, req.params);
    const body = parseOrThrow(heartbeatSchema, req.body);
    const updated = svc.devices.heartbeat(id, {
      batteryPct: body.batteryPct,
      paperStatus: body.paperStatus,
      coverOpen: body.coverOpen,
      printerError: body.printerError,
      firmwareVersion: body.firmwareVersion,
      wifiRssiDbm: body.wifiRssiDbm,
      uptimeSeconds: body.uptimeSeconds,
      chipTemperatureC: body.chipTemperatureC,
      ipAddress: body.ipAddress,
    });
    if (!updated) return res.code(404).send({ error: 'device not found' });

    if (id === 'esp32-01' && body.powerBankPct !== null) {
      svc.devices.heartbeat('powerbank-01', { batteryPct: body.powerBankPct });
    }
    return updated;
  });

  // Zero-paper browser debug workbench & preview API
  app.get('/debug/printer', (_req, res) => {
    res.header('content-type', 'text/html; charset=utf-8');
    return DEBUG_PRINTER_HTML;
  });

  app.post('/api/printer/preview', { bodyLimit: 8 * 1024 * 1024 }, async (req) => {
    const body = parseOrThrow(printerPreviewSchema, req.body);
    const out = await svc.renderer({
      template: body.template,
      style: body.style,
      fontProfile: body.fontProfile,
      fontScale: body.fontScale,
      algorithm: body.algorithm,
      gamma: body.gamma,
      threshold: body.threshold,
      hybrid: body.hybrid,
      photoOptions: body.photoOptions,
      data: body.data,
    });
    return {
      widthPx: out.raster.payload.widthPx,
      heightPx: out.raster.payload.heightPx,
      bytesPerRow: out.raster.payload.bytesPerRow,
      byteLength: out.raster.bitmap.length,
      renderMs: out.renderMs,
      stats: out.raster.stats,
      bitmapB64: out.raster.payload.bitmapB64,
      originalPngDataUrl: 'data:image/png;base64,' + out.originalPng.toString('base64'),
      ditheredPngDataUrl: 'data:image/png;base64,' + out.raster.previewPng.toString('base64'),
    };
  });

  // OAuth 2.0 + Remote MCP endpoint (exposed via Cloudflare Tunnel)
  registerOAuth(app);
  registerMcp(app, svc);

  return app;
}

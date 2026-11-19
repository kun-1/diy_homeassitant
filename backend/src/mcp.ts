import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { DEFAULT_FONT_PROFILE } from './defaults.js';
import { verifyOAuthAccessToken } from './oauth.js';
import type { PrinterTodoService } from './service.js';

const MAX_PRINTS_PER_MINUTE = Number(process.env.MCP_MAX_PRINTS_PER_MINUTE ?? 5);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Sliding-window limiter so a looping AI cannot burn through the paper roll. */
class PrintRateLimiter {
  private stamps: number[] = [];
  constructor(private limit: number) {}
  take(now = Date.now()): boolean {
    this.stamps = this.stamps.filter((t) => now - t < 60_000);
    if (this.stamps.length >= this.limit) return false;
    this.stamps.push(now);
    return true;
  }
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol) || PRIVATE_HOST.test(parsed.hostname)) {
    throw new Error('imageUrl must be a public http(s) URL');
  }
  const res = await fetch(parsed, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`image download failed: HTTP ${res.status}`);
  const type = res.headers.get('content-type')?.split(';')[0] ?? '';
  if (!type.startsWith('image/')) throw new Error('imageUrl did not return an image');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('image larger than 4MB');
  return `data:${type};base64,${buf.toString('base64')}`;
}

const text = (value: unknown, isError = false) => ({
  content: [
    {
      type: 'text' as const,
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    },
  ],
  isError,
});

function buildMcpServer(svc: PrinterTodoService, limiter: PrintRateLimiter): McpServer {
  const server = new McpServer({ name: 'printer-todo', version: '1.0.0' });

  const enqueue = (
    template: 'todo' | 'focus' | 'note' | 'photo',
    data: Record<string, unknown>,
  ) => {
    if (!limiter.take()) {
      return text(
        `Rate limit: at most ${MAX_PRINTS_PER_MINUTE} prints per minute. Try again shortly.`,
        true,
      );
    }
    const job = svc.printJobs.create({
      template,
      style: 'receipt',
      fontProfile: DEFAULT_FONT_PROFILE,
      payload: data,
      renderOptions: {},
    });
    return text({ queued: true, jobId: job.id, template, note: 'The printer picks it up within ~5 seconds.' });
  };

  server.registerTool(
    'print_daily_todo',
    {
      description:
        "Print the daily todo checklist on the thermal printer. Without `items` it prints all unfinished todos from the database (optionally only one owner's).",
      inputSchema: {
        owner: z.string().max(40).optional().describe('Only print this person\'s todos, e.g. "kun".'),
        items: z
          .array(
            z.object({
              title: z.string().min(1).max(200),
              priority: z.enum(['high', 'normal', 'low']).optional(),
            }),
          )
          .max(20)
          .optional()
          .describe('Explicit checklist to print instead of reading the database.'),
        date: z.string().max(40).optional().describe('Header date text; defaults to tomorrow.'),
      },
    },
    async ({ owner, items, date }) => enqueue('todo', { owner, items, date }),
  );

  server.registerTool(
    'add_and_print_todo',
    {
      description:
        'Save a new todo in the database and optionally print it right away as a single large "focus ticket" slip.',
      inputSchema: {
        title: z.string().min(1).max(200),
        owner: z.string().max(40).optional(),
        priority: z.enum(['high', 'normal', 'low']).default('normal'),
        deadline: z.string().max(60).optional().describe('Free-text due time, e.g. "today 18:00".'),
        subtasks: z.array(z.string().max(100)).max(6).optional(),
        printNow: z.boolean().default(true),
      },
    },
    async ({ title, owner, priority, deadline, subtasks, printNow }) => {
      const todo = svc.todos.create({ title, owner: owner ?? null, priority, dueDate: deadline ?? null });
      if (!printNow) return text({ saved: true, todoId: todo.id, printed: false });
      const result = enqueue('focus', { title, deadline, subtasks, noteLines: 3 });
      return result.isError ? result : text({ saved: true, todoId: todo.id, printed: true });
    },
  );

  server.registerTool(
    'print_couple_note',
    {
      description:
        'Print a short message slip (a little paper note) for the partner. Keep the body under ~200 characters.',
      inputSchema: {
        body: z.string().min(1).max(500),
        title: z.string().max(80).optional(),
        from: z.string().max(40).optional().describe('Signature, e.g. the sender\'s name.'),
      },
    },
    async ({ body, title, from }) => enqueue('note', { body, title, from }),
  );

  server.registerTool(
    'print_photo_card',
    {
      description:
        'Print a photo card (dithered photo + crisp caption). Provide either a public imageUrl or imageBase64.',
      inputSchema: {
        imageUrl: z.string().url().optional(),
        imageBase64: z.string().max(6_000_000).optional().describe('Raw base64 (no data: prefix), PNG/JPEG/WebP.'),
        mimeType: z.string().default('image/jpeg'),
        caption: z.string().max(200).optional(),
        date: z.string().max(40).optional(),
      },
    },
    async ({ imageUrl, imageBase64, mimeType, caption, date }) => {
      let imageDataUrl: string | undefined;
      try {
        if (imageUrl) imageDataUrl = await fetchImageAsDataUrl(imageUrl);
        else if (imageBase64) imageDataUrl = `data:${mimeType};base64,${imageBase64}`;
      } catch (err) {
        return text(err instanceof Error ? err.message : 'image error', true);
      }
      if (!imageDataUrl) return text('Provide imageUrl or imageBase64.', true);
      return enqueue('photo', { imageDataUrl, caption, date });
    },
  );

  server.registerTool(
    'get_printer_status',
    {
      description:
        'Check whether the wireless printer is online and ready: paper, cover, battery percentage and queue length. Call this before printing if unsure.',
      inputSchema: {},
    },
    async () => {
      const devices = svc.devices.list();
      const pick = (id: string) => devices.find((d) => d.id === id);
      const printer = pick('printer-01');
      const esp = pick('esp32-01');
      const battery = pick('powerbank-01');
      const jobs = svc.printJobs.list(100);
      return text({
        ready: svc.isPrinterReady(),
        esp32: esp?.status ?? 'unknown',
        printer: printer?.status ?? 'unknown',
        paper: printer?.paperStatus ?? 'unknown',
        coverOpen: printer?.coverOpen ?? null,
        batteryPct: battery?.batteryPct ?? null,
        queuedJobs: jobs.filter((j) => j.status === 'queued').length,
        failedJobs: jobs.filter((j) => j.status === 'failed').length,
      });
    },
  );

  return server;
}

export function registerMcp(app: FastifyInstance, svc: PrinterTodoService): void {
  const limiter = new PrintRateLimiter(MAX_PRINTS_PER_MINUTE);

  const authorize = (req: FastifyRequest, reply: FastifyReply): boolean => {
    const expected = process.env.MCP_TOKEN;
    if (!expected) {
      void reply.code(503).send({ error: 'MCP_TOKEN is not configured on the server' });
      return false;
    }
    const header = req.headers.authorization ?? '';
    const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
    const ok = Boolean(
      provided && (tokensMatch(provided, expected) || verifyOAuthAccessToken(provided, expected)),
    );
    if (!ok) {
      const protoHeader = req.headers['x-forwarded-proto'];
      const proto = Array.isArray(protoHeader)
        ? protoHeader[0]
        : (protoHeader?.split(',')[0]?.trim() || req.protocol || 'http');
      const hostHeader = req.headers['x-forwarded-host'] ?? req.headers.host ?? '127.0.0.1:3100';
      const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader.split(',')[0].trim();
      const metaUrl = `${proto}://${host}/.well-known/oauth-protected-resource`;
      void reply
        .code(401)
        .header('www-authenticate', `Bearer resource_metadata="${metaUrl}"`)
        .send({ error: 'unauthorized' });
      return false;
    }
    return true;
  };

  app.post('/mcp', { bodyLimit: 10 * 1024 * 1024 }, async (req, reply) => {
    if (!authorize(req, reply)) return reply;
    // Stateless mode: a fresh server + transport per request, no session to leak or expire.
    const server = buildMcpServer(svc, limiter);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    reply.hijack();
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
    return reply;
  });

  const methodNotAllowed = async (_req: FastifyRequest, reply: FastifyReply) =>
    reply.code(405).header('allow', 'POST').send({ error: 'Method not allowed; use POST /mcp' });
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);
}

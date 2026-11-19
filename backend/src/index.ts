import process from 'node:process';
import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = process.env.DATABASE_PATH ?? './data/printer-todo.sqlite';

const app = buildApp(dbPath);
await app.listen({ port, host });
console.log(`Printer Todo backend listening on http://${host}:${port} (debug UI: /debug/printer)`);

const heartbeatHost = host === '0.0.0.0' ? '127.0.0.1' : host;
const reportHostHeartbeat = async () => {
  try {
    await fetch(`http://${heartbeatHost}:${port}/api/devices/host-01/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ batteryPct: null }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Ignore transient self-heartbeat failure
  }
};

await reportHostHeartbeat();
const timer = setInterval(reportHostHeartbeat, 30_000);
timer.unref();

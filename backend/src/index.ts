import process from 'node:process'; import {buildApp} from './app.js';

const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? '127.0.0.1';
const db = process.env.DATABASE_PATH ?? './data/office-companion.sqlite';
const requestedCalendarProvider = process.env.CALENDAR_PROVIDER ?? process.env.PROVIDER_MODE;
const calendarProvider = requestedCalendarProvider === 'google' ? 'google' : 'mock';
const app = buildApp(db, calendarProvider);
await app.listen({ port, host });

const heartbeatHost = process.env.HEARTBEAT_HOST ?? (host === '0.0.0.0' ? '127.0.0.1' : host);
const reportMacMiniHeartbeat = async () => {
  try {
    await fetch('http://' + heartbeatHost + ':' + port + '/api/devices/macmini-01/heartbeat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ batteryPct: null }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // The API is already running; a transient self-heartbeat failure must not stop it.
  }
};
await reportMacMiniHeartbeat();
const heartbeatTimer = setInterval(reportMacMiniHeartbeat, 30000);
heartbeatTimer.unref();

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(filename: string): Database.Database {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'normal',
      tag TEXT,
      owner TEXT,
      due_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS print_jobs (
      id TEXT PRIMARY KEY,
      template TEXT NOT NULL,
      style TEXT NOT NULL DEFAULT 'receipt',
      font_profile TEXT NOT NULL DEFAULT 'source-han',
      payload_json TEXT NOT NULL DEFAULT '{}',
      render_options_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      error TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offline',
      last_seen_at TEXT,
      battery_pct INTEGER,
      paper_status TEXT,
      cover_open INTEGER,
      printer_error INTEGER,
      firmware_version TEXT,
      wifi_rssi_dbm INTEGER,
      uptime_seconds INTEGER,
      chip_temperature_c REAL,
      ip_address TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();
  const seedDevice = db.prepare(`
    INSERT OR IGNORE INTO devices (id, name, kind, status, updated_at)
    VALUES (@id, @name, @kind, 'offline', @updatedAt)
  `);
  seedDevice.run({ id: 'host-01', name: 'Mac Host', kind: 'host', updatedAt: now });
  seedDevice.run({ id: 'esp32-01', name: 'ESP32-S3 Controller', kind: 'esp32', updatedAt: now });
  seedDevice.run({ id: 'printer-01', name: 'EM5823H Thermal Printer', kind: 'printer', updatedAt: now });
  seedDevice.run({ id: 'powerbank-01', name: 'Printer Battery (INA219)', kind: 'powerBank', updatedAt: now });

  return db;
}

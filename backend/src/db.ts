import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(filename:string):Database.Database {
  fs.mkdirSync(path.dirname(filename), {recursive:true});
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS calendar_events (id TEXT PRIMARY KEY,title TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,description TEXT,location TEXT,updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY,title TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0,due_date TEXT,updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS letters (id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,signature TEXT NOT NULL,paper TEXT NOT NULL DEFAULT 'border',unread INTEGER NOT NULL DEFAULT 1,archived INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS print_jobs (id TEXT PRIMARY KEY,letter_id TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,completed_at TEXT);
  CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,last_seen_at TEXT,battery_pct INTEGER,updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS eink_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  const letterColumns = db.prepare('PRAGMA table_info(letters)').all() as Array<{name:string}>;
  if (!letterColumns.some((column) => column.name === 'paper')) {
    db.exec("ALTER TABLE letters ADD COLUMN paper TEXT NOT NULL DEFAULT 'border'");
  }
  if (!letterColumns.some((column) => column.name === 'metadata_json')) {
    db.exec("ALTER TABLE letters ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{\"content\":\"none\"}'");
  }
  if (!letterColumns.some((column) => column.name === 'archived')) db.exec('ALTER TABLE letters ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
  const deviceColumns = db.prepare('PRAGMA table_info(devices)').all() as Array<{name:string}>;
  if (!deviceColumns.some((column) => column.name === 'paper_status')) db.exec("ALTER TABLE devices ADD COLUMN paper_status TEXT");
  if (!deviceColumns.some((column) => column.name === 'cover_open')) db.exec("ALTER TABLE devices ADD COLUMN cover_open INTEGER");
  if (!deviceColumns.some((column) => column.name === 'printer_error')) db.exec("ALTER TABLE devices ADD COLUMN printer_error INTEGER");
  if (!deviceColumns.some((column) => column.name === 'firmware_version')) db.exec("ALTER TABLE devices ADD COLUMN firmware_version TEXT");
  if (!deviceColumns.some((column) => column.name === 'wifi_rssi_dbm')) db.exec("ALTER TABLE devices ADD COLUMN wifi_rssi_dbm INTEGER");
  if (!deviceColumns.some((column) => column.name === 'uptime_seconds')) db.exec("ALTER TABLE devices ADD COLUMN uptime_seconds INTEGER");
  if (!deviceColumns.some((column) => column.name === 'chip_temperature_c')) db.exec("ALTER TABLE devices ADD COLUMN chip_temperature_c REAL");
  if (!deviceColumns.some((column) => column.name === 'ip_address')) db.exec("ALTER TABLE devices ADD COLUMN ip_address TEXT");
  const printJobColumns = db.prepare('PRAGMA table_info(print_jobs)').all() as Array<{name:string}>;
  if (!printJobColumns.some((column) => column.name === 'attempts')) db.exec("ALTER TABLE print_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0");
  if (!printJobColumns.some((column) => column.name === 'max_attempts')) db.exec("ALTER TABLE print_jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3");
  if (!printJobColumns.some((column) => column.name === 'error')) db.exec("ALTER TABLE print_jobs ADD COLUMN error TEXT");
  db.prepare("INSERT OR IGNORE INTO eink_meta(key,value) VALUES ('revision','0')").run();
  db.prepare("INSERT OR IGNORE INTO eink_meta(key,value) VALUES ('config',?)").run(JSON.stringify({mode:'birds',content:{schedule:false,todo:false,letters:false}}));
  return db;
}

import type Database from 'better-sqlite3';
import type {
  Device,
  PrintJob,
  PrintRenderOptions,
  PrinterPaperStatus,
  Todo,
  TodoPriority,
} from './types.js';
import type {
  ReceiptFontProfile,
  ReceiptStyle,
  ReceiptTemplateKind,
} from './receipt-templates.js';

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const HEARTBEAT_TTL_MS = 120_000;

interface TodoRow {
  id: string;
  title: string;
  completed: number;
  priority: TodoPriority;
  tag: string | null;
  owner: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

const mapTodo = (row: TodoRow): Todo => ({
  ...row,
  completed: Boolean(row.completed),
});

export class TodoRepository {
  constructor(private db: Database.Database) {}

  list(owner?: string): Todo[] {
    const sql = owner
      ? 'SELECT id,title,completed,priority,tag,owner,due_date dueDate,created_at createdAt,updated_at updatedAt FROM todos WHERE owner=? ORDER BY completed ASC, created_at DESC'
      : 'SELECT id,title,completed,priority,tag,owner,due_date dueDate,created_at createdAt,updated_at updatedAt FROM todos ORDER BY completed ASC, created_at DESC';
    const rows = (
      owner ? this.db.prepare(sql).all(owner) : this.db.prepare(sql).all()
    ) as TodoRow[];
    return rows.map(mapTodo);
  }

  get(id: string): Todo | null {
    const row = this.db
      .prepare(
        'SELECT id,title,completed,priority,tag,owner,due_date dueDate,created_at createdAt,updated_at updatedAt FROM todos WHERE id=?',
      )
      .get(id) as TodoRow | undefined;
    return row ? mapTodo(row) : null;
  }

  create(input: {
    title: string;
    completed?: boolean;
    priority?: TodoPriority;
    tag?: string | null;
    owner?: string | null;
    dueDate?: string | null;
  }): Todo {
    const ts = nowIso();
    const item: Todo = {
      id: makeId('todo'),
      title: input.title,
      completed: Boolean(input.completed),
      priority: input.priority ?? 'normal',
      tag: input.tag ?? null,
      owner: input.owner ?? null,
      dueDate: input.dueDate ?? null,
      createdAt: ts,
      updatedAt: ts,
    };
    this.db
      .prepare(
        'INSERT INTO todos (id,title,completed,priority,tag,owner,due_date,created_at,updated_at) VALUES (@id,@title,@completed,@priority,@tag,@owner,@dueDate,@createdAt,@updatedAt)',
      )
      .run({ ...item, completed: Number(item.completed) });
    return item;
  }

  update(
    id: string,
    patch: Partial<Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Todo | null {
    const existing = this.get(id);
    if (!existing) return null;
    const next: Todo = {
      ...existing,
      ...patch,
      updatedAt: nowIso(),
    };
    this.db
      .prepare(
        'UPDATE todos SET title=@title,completed=@completed,priority=@priority,tag=@tag,owner=@owner,due_date=@dueDate,updated_at=@updatedAt WHERE id=@id',
      )
      .run({ ...next, completed: Number(next.completed) });
    return next;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM todos WHERE id=?').run(id).changes > 0;
  }
}

interface PrintJobRow {
  id: string;
  template: ReceiptTemplateKind;
  style: ReceiptStyle;
  fontProfile: ReceiptFontProfile;
  payloadJson: string;
  renderOptionsJson: string;
  status: PrintJob['status'];
  attempts: number;
  maxAttempts: number;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

const mapPrintJob = (row: PrintJobRow): PrintJob => ({
  id: row.id,
  template: row.template,
  style: row.style,
  fontProfile: row.fontProfile,
  payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
  renderOptions: JSON.parse(row.renderOptionsJson) as PrintRenderOptions,
  status: row.status,
  attempts: row.attempts,
  maxAttempts: row.maxAttempts,
  error: row.error,
  createdAt: row.createdAt,
  completedAt: row.completedAt,
});

export class PrintJobRepository {
  constructor(private db: Database.Database) {}

  list(limit = 50): PrintJob[] {
    const rows = this.db
      .prepare(
        'SELECT id,template,style,font_profile fontProfile,payload_json payloadJson,render_options_json renderOptionsJson,status,attempts,max_attempts maxAttempts,error,created_at createdAt,completed_at completedAt FROM print_jobs ORDER BY created_at DESC LIMIT ?',
      )
      .all(limit) as PrintJobRow[];
    return rows.map(mapPrintJob);
  }

  get(id: string): PrintJob | null {
    const row = this.db
      .prepare(
        'SELECT id,template,style,font_profile fontProfile,payload_json payloadJson,render_options_json renderOptionsJson,status,attempts,max_attempts maxAttempts,error,created_at createdAt,completed_at completedAt FROM print_jobs WHERE id=?',
      )
      .get(id) as PrintJobRow | undefined;
    return row ? mapPrintJob(row) : null;
  }

  create(input: {
    template: ReceiptTemplateKind;
    style: ReceiptStyle;
    fontProfile: ReceiptFontProfile;
    payload: Record<string, unknown>;
    renderOptions?: PrintRenderOptions;
  }): PrintJob {
    const id = makeId('print');
    const createdAt = nowIso();
    this.db
      .prepare(
        'INSERT INTO print_jobs (id,template,style,font_profile,payload_json,render_options_json,status,created_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.template,
        input.style,
        input.fontProfile,
        JSON.stringify(input.payload ?? {}),
        JSON.stringify(input.renderOptions ?? {}),
        'queued',
        createdAt,
      );
    return this.get(id)!;
  }

  claimNext(): PrintJob | null {
    const claimTx = this.db.transaction(() => {
      const row = this.db
        .prepare(
          "SELECT id FROM print_jobs WHERE status='queued' ORDER BY created_at ASC LIMIT 1",
        )
        .get() as { id: string } | undefined;
      if (!row) return null;
      const changed = this.db
        .prepare("UPDATE print_jobs SET status='printing' WHERE id=? AND status='queued'")
        .run(row.id);
      if (changed.changes === 0) return null;
      return this.get(row.id);
    });
    return claimTx();
  }

  complete(id: string): PrintJob | null {
    const job = this.get(id);
    if (!job || job.status !== 'printing') return job;
    this.db
      .prepare(
        "UPDATE print_jobs SET status='completed',completed_at=?,error=NULL WHERE id=? AND status='printing'",
      )
      .run(nowIso(), id);
    return this.get(id);
  }

  fail(id: string, error: string, retryable = true): PrintJob | null {
    const job = this.get(id);
    if (!job || job.status !== 'printing') return job;
    const attempts = retryable ? job.attempts + 1 : job.maxAttempts;
    const status = retryable && attempts < job.maxAttempts ? 'queued' : 'failed';
    this.db
      .prepare(
        "UPDATE print_jobs SET status=?,attempts=?,completed_at=?,error=? WHERE id=? AND status='printing'",
      )
      .run(status, attempts, status === 'failed' ? nowIso() : null, error, id);
    return this.get(id);
  }

  retry(id: string): PrintJob | null {
    const job = this.get(id);
    if (!job || job.status !== 'failed' || job.attempts >= job.maxAttempts) {
      return job;
    }
    this.db
      .prepare(
        "UPDATE print_jobs SET status='queued',completed_at=NULL,error=NULL WHERE id=? AND status='failed'",
      )
      .run(id);
    return this.get(id);
  }
}

interface DeviceRow {
  id: string;
  name: string;
  kind: Device['kind'];
  status: 'online' | 'offline';
  lastSeenAt: string | null;
  batteryPct: number | null;
  paperStatus: PrinterPaperStatus | null;
  coverOpen: number | null;
  printerError: number | null;
  firmwareVersion: string | null;
  wifiRssiDbm: number | null;
  uptimeSeconds: number | null;
  chipTemperatureC: number | null;
  ipAddress: string | null;
  updatedAt: string;
}

const isFresh = (lastSeenAt: string | null): boolean =>
  Boolean(lastSeenAt && Date.now() - Date.parse(lastSeenAt) <= HEARTBEAT_TTL_MS);

export class DeviceRegistry {
  constructor(private db: Database.Database) {}

  list(): Device[] {
    const rows = this.db
      .prepare(
        'SELECT id,name,kind,status,last_seen_at lastSeenAt,battery_pct batteryPct,paper_status paperStatus,cover_open coverOpen,printer_error printerError,firmware_version firmwareVersion,wifi_rssi_dbm wifiRssiDbm,uptime_seconds uptimeSeconds,chip_temperature_c chipTemperatureC,ip_address ipAddress,updated_at updatedAt FROM devices ORDER BY id ASC',
      )
      .all() as DeviceRow[];

    return rows.map((row) => {
      const fresh = isFresh(row.lastSeenAt);
      return {
        ...row,
        status: fresh ? 'online' : 'offline',
        paperStatus:
          row.kind === 'printer' && fresh ? (row.paperStatus ?? 'unknown') : null,
        coverOpen:
          row.kind === 'printer' && fresh
            ? row.coverOpen === null
              ? null
              : Boolean(row.coverOpen)
            : null,
        printerError:
          row.kind === 'printer' && fresh
            ? row.printerError === null
              ? null
              : Boolean(row.printerError)
            : null,
      };
    });
  }

  get(id: string): Device | null {
    return this.list().find((d) => d.id === id) ?? null;
  }

  heartbeat(
    id: string,
    input: {
      batteryPct?: number | null;
      paperStatus?: PrinterPaperStatus | null;
      coverOpen?: boolean | null;
      printerError?: boolean | null;
      firmwareVersion?: string | null;
      wifiRssiDbm?: number | null;
      uptimeSeconds?: number | null;
      chipTemperatureC?: number | null;
      ipAddress?: string | null;
    },
  ): Device | null {
    const existing = this.get(id);
    if (!existing) return null;
    const ts = nowIso();
    this.db
      .prepare(
        `UPDATE devices
         SET status='online',
             last_seen_at=@lastSeenAt,
             battery_pct=@batteryPct,
             paper_status=@paperStatus,
             cover_open=@coverOpen,
             printer_error=@printerError,
             firmware_version=@firmwareVersion,
             wifi_rssi_dbm=@wifiRssiDbm,
             uptime_seconds=@uptimeSeconds,
             chip_temperature_c=@chipTemperatureC,
             ip_address=@ipAddress,
             updated_at=@updatedAt
         WHERE id=@id`,
      )
      .run({
        id,
        lastSeenAt: ts,
        batteryPct: input.batteryPct ?? existing.batteryPct,
        paperStatus: input.paperStatus ?? existing.paperStatus,
        coverOpen:
          input.coverOpen === undefined
            ? existing.coverOpen === null
              ? null
              : Number(existing.coverOpen)
            : input.coverOpen === null
              ? null
              : Number(input.coverOpen),
        printerError:
          input.printerError === undefined
            ? existing.printerError === null
              ? null
              : Number(existing.printerError)
            : input.printerError === null
              ? null
              : Number(input.printerError),
        firmwareVersion: input.firmwareVersion ?? existing.firmwareVersion,
        wifiRssiDbm: input.wifiRssiDbm ?? existing.wifiRssiDbm,
        uptimeSeconds: input.uptimeSeconds ?? existing.uptimeSeconds,
        chipTemperatureC: input.chipTemperatureC ?? existing.chipTemperatureC,
        ipAddress: input.ipAddress ?? existing.ipAddress,
        updatedAt: ts,
      });
    return this.get(id);
  }
}

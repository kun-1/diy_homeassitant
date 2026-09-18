import type Database from 'better-sqlite3';
import type {Device,Letter,LetterMetadata,Todo} from './types.js';
export {CalendarProviderError,GoogleCalendarProvider,MockCalendarProvider,createCalendarProvider} from './providers/calendar.js';
export type {CalendarProvider} from './providers/calendar.js';
const now=()=>new Date().toISOString(); const id=(p:string)=>`${p}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

export interface TodoRepository {list():Todo[]; create(input:Omit<Todo,'id'|'updatedAt'>):Todo; update(id:string,input:Partial<Omit<Todo,'id'>>):Todo|null; delete(id:string):boolean}
export interface LetterRepository {list():Letter[]; get(id:string):Letter|null; create(input:Omit<Letter,'id'|'createdAt'|'updatedAt'|'unread'|'archived'>):Letter; update(id:string,input:Partial<Pick<Letter,'title'|'body'|'signature'|'paper'|'metadata'|'unread'|'archived'>>):Letter|null; delete(id:string):boolean}
export type PrinterStatusUpdate = {paperStatus:'ok'|'near_end'|'out'|'unknown'|null;coverOpen:boolean|null;printerError:boolean|null;firmwareVersion:string|null;wifiRssiDbm:number|null;uptimeSeconds:number|null;chipTemperatureC:number|null;ipAddress:string|null};
export interface DeviceRegistry {list():Device[]; heartbeat(id:string,batteryPct:number|null,status?:PrinterStatusUpdate):Device|null}

export class MockTodoRepository implements TodoRepository {constructor(private db:Database.Database){} list(){return (this.db.prepare('SELECT id,title,completed,due_date dueDate,updated_at updatedAt FROM todos ORDER BY due_date').all() as Array<{id:string;title:string;completed:number;dueDate:string|null;updatedAt:string}>).map(v=>({...v,completed:Boolean(v.completed)}))} create(x:Omit<Todo,'id'|'updatedAt'>){const v={...x,id:id('todo'),updatedAt:now()};this.db.prepare('INSERT INTO todos VALUES (@id,@title,@completed,@dueDate,@updatedAt)').run({...v,completed:Number(v.completed)});return v} update(i:string,x:Partial<Omit<Todo,'id'>>){const old=this.list().find(v=>v.id===i);if(!old)return null;const v={...old,...x,updatedAt:now()};this.db.prepare('UPDATE todos SET title=@title,completed=@completed,due_date=@dueDate,updated_at=@updatedAt WHERE id=@id').run({...v,completed:Number(v.completed)});return v} delete(i:string){return this.db.prepare('DELETE FROM todos WHERE id=?').run(i).changes>0}}
const parseLetterMetadata = (value:string):LetterMetadata => {
  try {
    const parsed=JSON.parse(value) as Partial<LetterMetadata>;
    return { ...parsed, content: parsed.content ?? 'none' } as LetterMetadata;
  } catch { return {content:'none'}; }
};
export class MockLetterRepository {
  constructor(private db:Database.Database){}
  list(){
    const rows=this.db.prepare('SELECT id,title,body,signature,paper,metadata_json metadataJson,unread,archived,created_at createdAt,updated_at updatedAt FROM letters ORDER BY created_at DESC').all() as Array<{id:string;title:string;body:string;signature:string;paper:Letter['paper'];metadataJson:string;unread:number;archived:number;createdAt:string;updatedAt:string}>;
    return rows.map(({metadataJson,...v})=>({...v,metadata:parseLetterMetadata(metadataJson),unread:Boolean(v.unread),archived:Boolean(v.archived)}));
  }
  get(i:string){return this.list().find(v=>v.id===i)??null}
  create(x:Omit<Letter,'id'|'createdAt'|'updatedAt'|'unread'|'archived'>){
    const v={...x,id:id('letter'),unread:true,archived:false,createdAt:now(),updatedAt:now()};
    this.db.prepare('INSERT INTO letters (id,title,body,signature,paper,metadata_json,unread,archived,created_at,updated_at) VALUES (@id,@title,@body,@signature,@paper,@metadataJson,@unread,@archived,@createdAt,@updatedAt)').run({...v,metadataJson:JSON.stringify(v.metadata),unread:1,archived:0});
    return v;
  }
  update(i:string,x:Partial<Pick<Letter,'title'|'body'|'signature'|'paper'|'metadata'|'unread'|'archived'>>){
    const old=this.get(i);if(!old)return null;
    const v={...old,...x,updatedAt:now()};
    this.db.prepare('UPDATE letters SET title=@title,body=@body,signature=@signature,paper=@paper,metadata_json=@metadataJson,unread=@unread,archived=@archived,updated_at=@updatedAt WHERE id=@id').run({...v,metadataJson:JSON.stringify(v.metadata),unread:Number(v.unread),archived:Number(v.archived)});
    return v;
  }
  delete(i:string){this.db.prepare('DELETE FROM print_jobs WHERE letter_id=?').run(i);return this.db.prepare('DELETE FROM letters WHERE id=?').run(i).changes>0}
}
export const DEVICE_HEARTBEAT_TTL_MS = 90_000;
const DIRECT_HEARTBEAT_KINDS = new Set<Device['kind']>(['macmini','esp32','printer','powerBank']);
const isFresh = (lastSeenAt:string|null, nowMs=Date.now()) => {
  if (!lastSeenAt) return false;
  const seenMs = Date.parse(lastSeenAt);
  return Number.isFinite(seenMs) && nowMs - seenMs <= DEVICE_HEARTBEAT_TTL_MS;
};
export class MockDeviceRegistry implements DeviceRegistry {
  constructor(private db:Database.Database){}
  syncStatuses(){
    const rows = this.db.prepare('SELECT id,kind,status,last_seen_at lastSeenAt FROM devices').all() as Array<{id:string;kind:Device['kind'];status:Device['status'];lastSeenAt:string|null}>;
    const directStatus = new Map(rows.filter(row => row.kind !== 'eink').map(row => [row.id, isFresh(row.lastSeenAt) ? 'online' as const : 'offline' as const]));
    const esp32 = rows.find(row => row.kind === 'esp32');
    const derivedEinkStatus = esp32 && directStatus.get(esp32.id) === 'online' ? 'online' as const : 'offline' as const;
    const update = this.db.prepare('UPDATE devices SET status=@status,updated_at=@updatedAt WHERE id=@id');
    const stamp = now();
    let changed = false;
    for (const row of rows) {
      const desired = row.kind === 'eink' ? derivedEinkStatus : directStatus.get(row.id)!;
      if (row.status !== desired) {
        update.run({id: row.id, status: desired, updatedAt: stamp});
        changed = true;
      }
    }
    return changed;
  }
  list(){
    const rows = this.db.prepare('SELECT id,name,kind,status,last_seen_at lastSeenAt,battery_pct batteryPct,paper_status paperStatus,cover_open coverOpen,printer_error printerError,firmware_version firmwareVersion,wifi_rssi_dbm wifiRssiDbm,uptime_seconds uptimeSeconds,chip_temperature_c chipTemperatureC,ip_address ipAddress,updated_at updatedAt FROM devices').all() as Array<Omit<Device,'statusSource'> & {statusSource?:never}>;
    const direct = rows.map(row => ({
      ...row,
      status: isFresh(row.lastSeenAt) ? 'online' as const : 'offline' as const,
      statusSource: 'direct' as const,
      statusReason: !row.lastSeenAt ? 'heartbeat_missing' as const : isFresh(row.lastSeenAt) ? 'direct_heartbeat' as const : 'heartbeat_expired' as const,
      // A missing report is unknown. Never manufacture a percentage for UI convenience.
      batteryPct: isFresh(row.lastSeenAt) && typeof row.batteryPct === 'number' && row.batteryPct >= 0 && row.batteryPct <= 100 ? row.batteryPct : null,
      paperStatus: row.kind === 'printer' && isFresh(row.lastSeenAt) ? row.paperStatus ?? 'unknown' : null,
      coverOpen: row.kind === 'printer' && isFresh(row.lastSeenAt) ? row.coverOpen === null ? null : Boolean(row.coverOpen) : null,
      printerError: row.kind === 'printer' && isFresh(row.lastSeenAt) ? row.printerError === null ? null : Boolean(row.printerError) : null,
    }));
    const esp32 = direct.find(device => device.kind === 'esp32');
    return direct.map(device => {
      if (device.kind !== 'eink') return device;
      // The panel has no independent heartbeat. Its reachability is the ESP32's reachability.
      return {
        ...device,
        status: esp32?.status === 'online' ? 'online' as const : 'offline' as const,
        statusSource: 'derived' as const,
        statusReason: 'derived_from_esp32' as const,
        lastSeenAt: esp32?.lastSeenAt ?? null,
        batteryPct: null,
      };
    });
  }
  heartbeat(i:string,batteryPct:number|null,status?:PrinterStatusUpdate){
    const old = this.db.prepare('SELECT id,name,kind,status,last_seen_at lastSeenAt,battery_pct batteryPct,paper_status paperStatus,cover_open coverOpen,printer_error printerError,firmware_version firmwareVersion,wifi_rssi_dbm wifiRssiDbm,uptime_seconds uptimeSeconds,updated_at updatedAt FROM devices WHERE id=?').get(i) as (Omit<Device,'statusSource'> & {statusSource?:never})|undefined;
    if (!old || !DIRECT_HEARTBEAT_KINDS.has(old.kind)) return null;
    const v = {...old,status:'online' as const,statusReason:'direct_heartbeat' as const,lastSeenAt:now(),batteryPct:typeof batteryPct === 'number' ? batteryPct : null,paperStatus:status?.paperStatus ?? old.paperStatus ?? null,coverOpen:status?.coverOpen ?? old.coverOpen ?? null,printerError:status?.printerError ?? old.printerError ?? null,firmwareVersion:status?.firmwareVersion ?? old.firmwareVersion ?? null,wifiRssiDbm:status?.wifiRssiDbm ?? old.wifiRssiDbm ?? null,uptimeSeconds:status?.uptimeSeconds ?? old.uptimeSeconds ?? null,chipTemperatureC:status?.chipTemperatureC ?? old.chipTemperatureC ?? null,ipAddress:status?.ipAddress ?? old.ipAddress ?? null,updatedAt:now(),statusSource:'direct' as const};
    this.db.prepare('UPDATE devices SET status=@status,last_seen_at=@lastSeenAt,battery_pct=@batteryPct,paper_status=@paperStatus,cover_open=@coverOpen,printer_error=@printerError,firmware_version=@firmwareVersion,wifi_rssi_dbm=@wifiRssiDbm,uptime_seconds=@uptimeSeconds,chip_temperature_c=@chipTemperatureC,ip_address=@ipAddress,updated_at=@updatedAt WHERE id=@id').run({...v,coverOpen:v.coverOpen===null?null:Number(v.coverOpen),printerError:v.printerError===null?null:Number(v.printerError)});
    return v;
  }
}
export class MockPrinterProvider {
  constructor(private db:Database.Database){}
  create(letterId:string){const v={id:id('print'),letterId,status:'queued' as const,createdAt:now(),completedAt:null};this.db.prepare('INSERT INTO print_jobs (id,letter_id,status,created_at,completed_at) VALUES (@id,@letterId,@status,@createdAt,@completedAt)').run(v);return v}
  list(){return this.db.prepare('SELECT id,letter_id letterId,status,attempts,max_attempts maxAttempts,created_at createdAt,completed_at completedAt,error FROM print_jobs ORDER BY created_at DESC').all()}
  get(i:string){return this.list().find(v=>(v as {id:string}).id===i)??null}
  claimNext(){
    const claim=this.db.transaction(()=>{
      const row=this.db.prepare("SELECT p.id,p.letter_id letterId,p.status,p.created_at createdAt,p.completed_at completedAt FROM print_jobs p JOIN letters l ON l.id=p.letter_id WHERE p.status='queued' ORDER BY p.created_at ASC LIMIT 1").get() as {id:string;letterId:string;status:'queued';createdAt:string;completedAt:null}|undefined;
      if(!row)return null;
      const changed=this.db.prepare("UPDATE print_jobs SET status='printing' WHERE id=? AND status='queued'").run(row.id);
      return changed.changes===1 ? this.get(row.id) : null;
    });
    return claim();
  }
  complete(i:string){const job=this.get(i) as {letterId:string;status:string}|null;if(!job)return null;if(job.status!=='printing')return job;this.db.prepare("UPDATE print_jobs SET status='completed',completed_at=?,error=NULL WHERE id=? AND status='printing'").run(now(),i);this.db.prepare('UPDATE letters SET unread=0,updated_at=? WHERE id=?').run(now(),job.letterId);return this.get(i)}
  fail(i:string,error:string,retryable=true){const job=this.get(i) as {status:string;attempts:number;maxAttempts:number}|null;if(!job)return null;if(job.status!=='printing')return job;const attempts=retryable?job.attempts+1:job.maxAttempts;const status=retryable&&attempts<job.maxAttempts?'queued':'failed';this.db.prepare("UPDATE print_jobs SET status=?,attempts=?,completed_at=?,error=? WHERE id=? AND status='printing'").run(status,attempts,status==='failed'?now():null,error,i);return this.get(i)}
  retry(i:string){const job=this.get(i) as {status:string;attempts:number;maxAttempts:number}|null;if(!job)return null;if(job.status!=='failed'||job.attempts>=job.maxAttempts)return job;this.db.prepare("UPDATE print_jobs SET status='queued',completed_at=NULL,error=NULL WHERE id=? AND status='failed'").run(i);return this.get(i)}
}

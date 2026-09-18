import type { EInkArrangement } from './eink-content-model';
import { getCached, putCached } from './offline-store';

export type ScheduleItem = {
  id?: string;
  time: string;
  title: string;
  note?: string;
  tone: 'coral' | 'sage' | 'ink';
};

export type TodoItem = {
  id: string;
  title: string;
  due: string;
  category: '生活' | '一起';
  completed: boolean;
};

export type Device = {
  id: string;
  label: string;
  kind: 'macmini' | 'esp32' | 'printer' | 'eink' | 'powerBank';
  status: 'online' | 'attention';
  detail: string;
  batteryPct?: number | null;
  statusSource?: string;
  updatedAt?: string;
  firmwareVersion?: string | null;
  wifiRssiDbm?: number | null;
  uptimeSeconds?: number | null;
  chipTemperatureC?: number | null;
  ipAddress?: string | null;
};

export type TodayData = {
  dateKey?: string;
  date: string;
  weekday: string;
  weather: string;
  weatherNote: string;
  unreadLetterCount: number;
  companionMessage: string;
  companionStatus: string;
  schedule: ScheduleItem[];
  todos: TodoItem[];
  devices: Device[];
  weatherSnapshot?: { location: string; temperatureC: number; lowC: number | null; highC: number | null; label: string };
  revision?: string;
  latestUnreadLetterUpdatedAt?: string;
};

export type MacMiniStatus = {
  id: string;
  name: string;
  status: 'online' | 'offline';
  lastConnectedAt: string | null;
  dataUpdatedAt: string | null;
  serviceStatus: { pwa: 'ok' | 'error'; api: 'ok' | 'error' };
  uptimeSeconds: number;
  revision: number;
  source: 'real_mac_mini';
  generatedAt: string;
};

export type EInkState = {
  revision: number;
  generatedAt: string;
  config: EInkArrangement;
  unreadLetterCount: number;
  calendarEvents: BackendCalendarEvent[];
  todos: BackendTodo[];
  devices: Array<{ id: string; name: string; kind: Device['kind']; status: 'online' | 'offline'; statusSource: 'direct' | 'derived'; lastSeenAt: string | null; batteryPct: number | null }>;
};

export type EInkStateResult = {
  state: EInkState | null;
  unchanged: boolean;
  etag: string | null;
};

const localYmd = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const weekdayCn = (value: Date) => `周${['日', '一', '二', '三', '四', '五', '六'][value.getDay()]}`;
const viewDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return { short: `${month} / ${day}`, weekday: weekdayCn(date) };
};
const scheduleTone = (index: number): ScheduleItem['tone'] => index === 0 ? 'coral' : index === 2 ? 'sage' : 'ink';
const todoCategory = (title: string): TodoItem['category'] => /Guozi|爸妈|一起|预约/.test(title) ? '一起' : '生活';
const mockDate = viewDate(localYmd(new Date()));

const mockToday: TodayData = {
  date: mockDate.short,
  dateKey: localYmd(new Date()),
  weekday: mockDate.weekday,
  weather: '23°',
  weatherNote: '多云转晴',
  unreadLetterCount: 1,
  companionMessage: '散步中 · 有点得意',
  companionStatus: '今天也一起把日子过好',
  schedule: [
    { time: '09:30', title: '一起去超市采购', note: '记得带环保袋和会员卡', tone: 'coral' },
    { time: '14:30', title: '整理书架 · 写读书笔记', tone: 'ink' },
    { time: '19:30', title: '晚餐:番茄牛肉汤', note: '饭后一起散步', tone: 'sage' },
    { time: '21:30', title: '给爸妈打个电话', tone: 'ink' },
  ],
  todos: [
    { id: 'laundry', title: '换洗床单', due: '今天', category: '生活', completed: false },
    { id: 'guozi-water', title: '给 Guozi 加水', due: '今天', category: '一起', completed: false },
    { id: 'plants', title: '整理阳台植物', due: '本周', category: '生活', completed: true },
    { id: 'checkup', title: '预约周末体检', due: '本周', category: '一起', completed: false },
    { id: 'family', title: '提醒爸妈吃药', due: '本周', category: '一起', completed: false },
  ],
  devices: [
    { id: 'macmini', label: 'macmini', kind: 'macmini', status: 'online', detail: '服务在线' },
    { id: 'esp32', label: 'esp32', kind: 'esp32', status: 'online', detail: '刚刚连接' },
    { id: 'printer', label: '打印机', kind: 'printer', status: 'attention', detail: '等待连接' },
    { id: 'eink', label: 'eink', kind: 'eink', status: 'online', detail: '屏幕在线' },
    { id: 'powerbank', label: 'Waveshare UPS 3S', kind: 'powerBank', status: 'online', detail: '86% 电量', batteryPct: 86 },
  ],
};

export async function loadToday(): Promise<TodayData> {
  if (import.meta.env.VITE_USE_API !== 'true') return mockToday;

  const base = import.meta.env.VITE_API_BASE_URL ?? '';
  let response: Response;
  try {
    response = await fetch(`${base}/api/today`);
  } catch (error) {
    const cached = await getCached<TodayData>('/api/today');
    if (cached) return cached;
    throw error;
  }
  if (!response.ok) throw new Error(`Today API failed: ${response.status}`);
  const payload = await response.json() as { date: string; calendarEvents: BackendCalendarEvent[]; todos: BackendTodo[]; unreadLetterCount: number; devices?: Array<{ id: string; name: string; kind: Device['kind']; status: 'online' | 'offline'; lastSeenAt: string | null; batteryPct: number | null; updatedAt?: string; statusSource?: string }>; weather?: { location: string; temperatureC: number; lowC: number | null; highC: number | null; label: string } | null };
  const todayKey = payload.date || localYmd(new Date());
  const viewed = viewDate(todayKey);
  const schedule = payload.calendarEvents.filter((event) => localYmd(new Date(event.startsAt)) === todayKey).map((event, index) => {
    const start = new Date(event.startsAt);
    return { id: event.id, time: String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0'), title: event.title, note: event.description ?? undefined, tone: scheduleTone(index) };
  });
  const todos = payload.todos.filter((todo) => todo.dueDate === todayKey || todo.dueDate === null).map((todo) => ({ id: todo.id, title: todo.title, due: todo.dueDate === todayKey ? '今天' : '未设日期', category: todoCategory(todo.title), completed: todo.completed }));
  const { devices: backendDevices, weather } = payload;
  const rawDevices = backendDevices ?? [];
  const devices = rawDevices.map((device) => ({
      id: device.id,
      label: device.name,
      kind: device.kind,
      status: device.status === 'online' ? 'online' as const : 'attention' as const,
      batteryPct: device.batteryPct,
      statusSource: device.statusSource,
      updatedAt: device.updatedAt,
      detail: device.batteryPct === null ? (device.status === 'online' ? '在线' : '等待连接') : `${device.batteryPct}% 电量`,
    }));
  let latestUnreadLetterUpdatedAt: string | undefined;
  const letterRevision: string[] = [];
  try {
    const lettersResponse = await fetch(`${base}/api/letters`);
    if (lettersResponse.ok) {
      const letters = await lettersResponse.json() as Array<{ unread: boolean; updatedAt?: string }>;
      latestUnreadLetterUpdatedAt = letters.filter((letter) => letter.unread && letter.updatedAt).map((letter) => letter.updatedAt as string).sort().at(-1);
      letterRevision.push(...letters.map((letter) => letter.updatedAt).filter((value): value is string => Boolean(value)));
    }
  } catch {
    /* Today remains usable when the optional letter revision endpoint is unavailable. */
  }
  const revision = [
    ...payload.calendarEvents.map((event) => event.updatedAt),
    ...payload.todos.map((todo) => todo.updatedAt),
    ...rawDevices.map((device) => device.updatedAt),
    ...letterRevision,
  ].filter((value): value is string => Boolean(value)).sort().at(-1);
  const result = {
    ...mockToday,
    date: viewed.short,
    dateKey: todayKey,
    weekday: viewed.weekday,
    schedule,
    todos,
    unreadLetterCount: payload.unreadLetterCount,
    ...(weather ? { weather: String(weather.temperatureC) + '°', weatherNote: weather.label, weatherSnapshot: weather } : {}),
    ...(devices.length ? { devices } : {}),
    ...(revision ? { revision } : {}),
    ...(latestUnreadLetterUpdatedAt ? { latestUnreadLetterUpdatedAt } : {}),
  };
  await putCached('/api/today', result);
  return result;
}

export async function loadEInkState(etag?: string): Promise<EInkStateResult> {
  if (!apiEnabled()) {
    const now = new Date().toISOString();
    return {
      state: {
        revision: 0,
        generatedAt: now,
        config: { mode: 'summary', content: { schedule: true, todo: true, letters: true } },
        unreadLetterCount: mockToday.unreadLetterCount,
        calendarEvents: mockToday.schedule.map((item, index) => ({ id: item.id ?? `mock-event-${index}`, title: item.title, startsAt: `${mockToday.dateKey}T${item.time}:00.000+08:00`, endsAt: `${mockToday.dateKey}T${item.time}:00:00.000+08:00`, description: item.note ?? null, location: null, updatedAt: now })),
        todos: mockToday.todos.map((item) => ({ id: item.id, title: item.title, completed: item.completed, dueDate: mockToday.dateKey ?? null, updatedAt: now })),
        devices: mockToday.devices.map((device) => ({ id: device.id, name: device.label, kind: device.kind, status: device.status === 'online' ? 'online' as const : 'offline' as const, statusSource: 'direct' as const, lastSeenAt: now, batteryPct: device.batteryPct ?? null })),
      },
      unchanged: false,
      etag: '"eink-0"',
    };
  }
  const headers = new Headers();
  if (etag) headers.set('If-None-Match', etag);
  const response = await fetch(`${apiBase()}/api/eink/state`, { headers });
  const nextEtag = response.headers.get('ETag');
  if (response.status === 304) return { state: null, unchanged: true, etag: etag ?? nextEtag };
  if (!response.ok) throw new Error(`E-ink state API failed: ${response.status}`);
  return { state: await response.json() as EInkState, unchanged: false, etag: nextEtag };
}

export const apiEnabled = () => import.meta.env.VITE_USE_API === 'true';
export const DATA_CHANGED_EVENT = 'guozi:data-changed';
export function notifyDataChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}
const apiBase = () => import.meta.env.VITE_API_BASE_URL ?? '';
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  try {
    const response = await fetch(apiBase() + path, { ...init, headers });
    if (!response.ok) throw new Error(method + ' ' + path + ' failed: ' + response.status);
    if (response.status === 204) return undefined as T;
    const value = await response.json() as T;
    if (method === 'GET') await putCached(path, value);
    return value;
  } catch (error) {
    if (method === 'GET') {
      const cached = await getCached<T>(path);
      if (cached !== null) return cached;
    }
    throw error;
  }
}

export type BackendCalendarEvent = { id: string; title: string; startsAt: string; endsAt: string; description: string | null; location: string | null; updatedAt: string };
export type BackendTodo = { id: string; title: string; completed: boolean; dueDate: string | null; updatedAt: string };
export type BackendLetter = { id: string; title: string; body: string; signature: string; paper?: 'border' | 'emoji' | 'receipt' | 'minimal'; metadata?: Record<string, any>; unread: boolean; archived: boolean; createdAt: string; updatedAt: string };
export type LetterPaper = 'border' | 'emoji' | 'receipt' | 'minimal';
export type AppSettings = { myName?: string; recipient?: string };
export type BackendDevice = { id: string; name: string; kind: Device['kind']; status: 'online' | 'offline'; lastSeenAt: string | null; batteryPct: number | null; firmwareVersion: string | null; wifiRssiDbm: number | null; uptimeSeconds: number | null; chipTemperatureC: number | null; ipAddress: string | null; updatedAt: string };
export type BackendPrintJob = { id: string; letterId: string; status: 'queued' | 'printing' | 'completed' | 'failed'; createdAt: string; completedAt: string | null };

export function listCalendarEvents() { return apiFetch<BackendCalendarEvent[]>('/api/calendar/events'); }
export function createCalendarEvent(input: Omit<BackendCalendarEvent, 'id' | 'updatedAt'>) { return apiFetch<BackendCalendarEvent>('/api/calendar/events', { method: 'POST', body: JSON.stringify(input) }); }
export function updateCalendarEvent(id: string, input: Partial<Omit<BackendCalendarEvent, 'id'>>) { return apiFetch<BackendCalendarEvent>('/api/calendar/events/' + id, { method: 'PATCH', body: JSON.stringify(input) }); }
export function deleteCalendarEvent(id: string) { return apiFetch<void>('/api/calendar/events/' + id, { method: 'DELETE' }); }
export function listTodos() { return apiFetch<BackendTodo[]>('/api/todos'); }
export function createTodo(input: Omit<BackendTodo, 'id' | 'updatedAt'>) { return apiFetch<BackendTodo>('/api/todos', { method: 'POST', body: JSON.stringify(input) }); }
export function updateTodo(id: string, input: Partial<Omit<BackendTodo, 'id'>>) { return apiFetch<BackendTodo>('/api/todos/' + id, { method: 'PATCH', body: JSON.stringify(input) }); }
export function deleteTodo(id: string) { return apiFetch<void>('/api/todos/' + id, { method: 'DELETE' }); }
export function listLetters() { return apiFetch<BackendLetter[]>('/api/letters'); }
export function deleteLetter(id: string) { return apiFetch<void>('/api/letters/' + id, { method: 'DELETE' }); }
export function listDevices() { return apiFetch<BackendDevice[]>('/api/devices'); }
export function getMacMiniStatus() { return apiFetch<MacMiniStatus>('/api/devices/macmini-01/status'); }
export function createLetter(input: { title: string; body: string; signature: string; paper?: 'border' | 'emoji' | 'receipt' | 'minimal'; metadata?: Record<string, unknown> }) { return apiFetch<BackendLetter>('/api/letters', { method: 'POST', body: JSON.stringify(input) }); }
export function updateLetter(id: string, input: Partial<Pick<BackendLetter, 'title' | 'body' | 'signature' | 'unread' | 'archived'>>) { return apiFetch<BackendLetter>('/api/letters/' + id, { method: 'PATCH', body: JSON.stringify(input) }); }
export function createPrintJob(letterId: string) { return apiFetch<{ id: string; letterId: string; status: string }>('/api/print/jobs', { method: 'POST', body: JSON.stringify({ letterId }) }); }
export function listPrintJobs() { return apiFetch<BackendPrintJob[]>('/api/print/jobs'); }
export function loadEInkConfig() { return apiFetch<EInkArrangement>('/api/eink/config'); }
export function updateEInkConfig(input: EInkArrangement) { return apiFetch<EInkArrangement>('/api/eink/config', { method: 'PATCH', body: JSON.stringify(input) }); }
export function getSettings() { return Promise.resolve({} as AppSettings); }

export type TodayPrintItem = { id: string; title: string; time: string; completed: boolean };
export type TodayPrintJob = { id: string; kind: 'today'; letterId: null; status: 'queued' | 'completed'; createdAt: string; completedAt: string | null; payload: { date: string; schedule: TodayPrintItem[]; todos: TodayPrintItem[] } };
export function createTodayPrintJob(input: { date: string; schedule: TodayPrintItem[]; todos: TodayPrintItem[] }) {
  return apiFetch<TodayPrintJob>('/api/print/jobs', { method: 'POST', body: JSON.stringify({ kind: 'today', ...input }) });
}

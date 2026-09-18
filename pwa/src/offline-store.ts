export type CacheEnvelope<T> = { value: T; savedAt: number };

export type QueuedMutation = {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: string;
  createdAt: number;
};

const DB_NAME = 'guozi-pwa-local-v1';
const DB_VERSION = 1;
const CACHE_STORE = 'cache';
const OUTBOX_STORE = 'outbox';
const CACHE_PREFIX = 'guozi-cache:';
const OUTBOX_KEY = 'guozi-outbox';
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return dbPromise;
}

function idbRequest<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export async function getCached<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (db) {
    try {
      const value = await idbRequest<CacheEnvelope<T> | undefined>(db.transaction(CACHE_STORE, 'readonly').objectStore(CACHE_STORE).get(key));
      return value?.value ?? null;
    } catch { /* fall through to the small-storage fallback */ }
  }
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as CacheEnvelope<T>).value : null;
  } catch { return null; }
}

export async function putCached<T>(key: string, value: T): Promise<void> {
  const envelope: CacheEnvelope<T> = { value, savedAt: Date.now() };
  const db = await openDb();
  if (db) {
    try {
      await idbRequest(db.transaction(CACHE_STORE, 'readwrite').objectStore(CACHE_STORE).put(envelope, key));
      return;
    } catch { /* use localStorage below */ }
  }
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(envelope)); } catch { /* cache is best effort */ }
}

function readOutboxFallback(): QueuedMutation[] {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]') as QueuedMutation[]; } catch { return []; }
}

function writeOutboxFallback(items: QueuedMutation[]) {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(items)); } catch { /* queue is best effort */ }
}

export async function listQueuedMutations(): Promise<QueuedMutation[]> {
  const db = await openDb();
  if (db) {
    try {
      const items = await idbRequest<QueuedMutation[]>(db.transaction(OUTBOX_STORE, 'readonly').objectStore(OUTBOX_STORE).getAll());
      return items.sort((a, b) => a.createdAt - b.createdAt);
    } catch { /* use localStorage below */ }
  }
  return readOutboxFallback().sort((a, b) => a.createdAt - b.createdAt);
}

export async function enqueueMutation(input: Omit<QueuedMutation, 'id' | 'createdAt'>): Promise<QueuedMutation> {
  const item: QueuedMutation = { ...input, id: `mutation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now() };
  const db = await openDb();
  if (db) {
    try {
      await idbRequest(db.transaction(OUTBOX_STORE, 'readwrite').objectStore(OUTBOX_STORE).put(item));
      return item;
    } catch { /* use localStorage below */ }
  }
  writeOutboxFallback([...readOutboxFallback(), item]);
  return item;
}

export async function removeQueuedMutation(id: string): Promise<void> {
  const db = await openDb();
  if (db) {
    try {
      await idbRequest(db.transaction(OUTBOX_STORE, 'readwrite').objectStore(OUTBOX_STORE).delete(id));
      return;
    } catch { /* use localStorage below */ }
  }
  writeOutboxFallback(readOutboxFallback().filter((item) => item.id !== id));
}

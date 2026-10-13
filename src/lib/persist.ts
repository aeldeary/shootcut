/**
 * Keeps the PDF the person opened on THIS device (IndexedDB), so another tool or another browser tab can
 * open it without asking for the upload again. Nothing is sent anywhere: the bytes stay in the browser.
 * Every function is safe to call when the browser has no IndexedDB (private modes, tests): it just does nothing.
 */
const DB_NAME = 'shootcut';
const STORE = 'files';
const FILE_KEY = 'current';
const META_KEY = 'meta';
const PREF_KEY = 'shootcut:keep';

export interface SavedMeta {
  name: string;
  size: number;
  savedAt: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();
const channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('shootcut') : null;

function notify(): void {
  listeners.forEach((l) => l());
}

channel?.addEventListener('message', notify);

/** called whenever the saved file or the keep setting changes, here or in another tab */
export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function broadcast(): void {
  notify();
  try {
    channel?.postMessage('changed');
  } catch {
    /* channel closed: other tabs refresh when they next open */
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** runs one transaction; resolves with whatever `fn` collects, or null when anything fails */
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | null): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    let req: IDBRequest | null = null;
    try {
      const t = db.transaction(STORE, mode);
      req = fn(t.objectStore(STORE));
      t.oncomplete = () => {
        db.close();
        resolve(req ? (req.result as T) : (true as T));
      };
      t.onerror = t.onabort = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

/** Saved files are dropped after this long, so nothing stays on the device for good by accident. */
export const RETENTION_MS = 24 * 60 * 60 * 1000;

/** null until the person has chosen once; keeping is off until then */
export function keepChoice(): boolean | null {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return false;
  }
}

export const isKeepEnabled = (): boolean => keepChoice() === true;

/** removes every saved PDF, picture, video and audio file from this device */
export async function forgetAll(): Promise<void> {
  await forgetSaved();
  await forgetMedia('image');
  await forgetMedia('video');
  await forgetMedia('audio');
}

const expired = (savedAt: number): boolean => Date.now() - savedAt > RETENTION_MS;

export async function setKeepEnabled(on: boolean): Promise<void> {
  try {
    localStorage.setItem(PREF_KEY, on ? '1' : '0');
  } catch {
    /* storage blocked: the setting only lasts until the page closes */
  }
  if (!on) await forgetAll();
  else broadcast();
}

/** Saves the file as the one to reopen. Returns false when keeping is off or the browser refused (no room). */
export async function saveFile(file: File): Promise<boolean> {
  if (!isKeepEnabled()) return false;
  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    return false;
  }
  const db = await openDb();
  if (!db) return false;
  const ok = await new Promise<boolean>((resolve) => {
    try {
      const t = db.transaction(STORE, 'readwrite');
      const s = t.objectStore(STORE);
      s.put({ data, type: file.type || 'application/pdf' }, FILE_KEY);
      s.put({ name: file.name, size: file.size, savedAt: Date.now() } satisfies SavedMeta, META_KEY);
      t.oncomplete = () => resolve(true);
      t.onerror = t.onabort = () => resolve(false); // e.g. quota exceeded: nothing was written
    } catch {
      resolve(false);
    }
  });
  db.close();
  if (ok) broadcast();
  return ok;
}

export async function getSavedMeta(): Promise<SavedMeta | null> {
  const m = (await run<SavedMeta | undefined>('readonly', (s) => s.get(META_KEY))) ?? null;
  if (m && expired(m.savedAt)) {
    await forgetSaved();
    return null;
  }
  return m;
}

/** the saved file as a File, or null when there is none */
export async function loadSaved(): Promise<File | null> {
  const [rec, meta] = await Promise.all([
    run<{ data: ArrayBuffer; type: string } | undefined>('readonly', (s) => s.get(FILE_KEY)),
    getSavedMeta(),
  ]);
  if (!rec || !meta) return null;
  return new File([rec.data], meta.name, { type: rec.type, lastModified: meta.savedAt });
}

/** removes the saved copy from this device */
export async function forgetSaved(): Promise<void> {
  await run('readwrite', (s) => {
    s.delete(FILE_KEY);
    return s.delete(META_KEY);
  });
  broadcast();
}

/* ------------------------------------------------------------------ pictures and videos */

/** The pictures or the videos last added, kept like the PDF so another tool of the same section opens them without a new upload. */
export type MediaKind = 'image' | 'video' | 'audio';

export interface MediaMeta {
  names: string[];
  count: number;
  size: number;
  savedAt: number;
}

const mediaKey = (kind: MediaKind) => `media:${kind}`;
const mediaMetaKey = (kind: MediaKind) => `media:${kind}:meta`;

interface MediaRecord {
  files: { data: ArrayBuffer; name: string; type: string; lastModified: number }[];
}

export async function saveMedia(kind: MediaKind, files: File[]): Promise<boolean> {
  if (!isKeepEnabled() || files.length === 0) return false;
  // raw bytes, like the PDF: some phones' browsers cannot store a Blob in IndexedDB
  let rec: MediaRecord;
  try {
    rec = { files: await Promise.all(files.map(async (f) => ({ data: await f.arrayBuffer(), name: f.name, type: f.type, lastModified: f.lastModified }))) };
  } catch {
    return false;
  }
  const db = await openDb();
  if (!db) return false;
  const ok = await new Promise<boolean>((resolve) => {
    try {
      const t = db.transaction(STORE, 'readwrite');
      const s = t.objectStore(STORE);
      s.put(rec, mediaKey(kind));
      s.put({ names: files.map((f) => f.name), count: files.length, size: files.reduce((n, f) => n + f.size, 0), savedAt: Date.now() } satisfies MediaMeta, mediaMetaKey(kind));
      t.oncomplete = () => resolve(true);
      t.onerror = t.onabort = () => resolve(false); // e.g. no room left: nothing was written
    } catch {
      resolve(false);
    }
  });
  db.close();
  if (ok) broadcast();
  return ok;
}

export async function getMediaMeta(kind: MediaKind): Promise<MediaMeta | null> {
  const m = (await run<MediaMeta | undefined>('readonly', (s) => s.get(mediaMetaKey(kind)))) ?? null;
  if (m && expired(m.savedAt)) {
    await forgetMedia(kind);
    return null;
  }
  return m;
}

export async function loadMedia(kind: MediaKind): Promise<File[]> {
  if (!(await getMediaMeta(kind))) return [];
  const rec = await run<MediaRecord | undefined>('readonly', (s) => s.get(mediaKey(kind)));
  if (!rec) return [];
  return rec.files.map((f) => new File([f.data], f.name, { type: f.type, lastModified: f.lastModified }));
}

export async function forgetMedia(kind: MediaKind): Promise<void> {
  await run('readwrite', (s) => {
    s.delete(mediaKey(kind));
    return s.delete(mediaMetaKey(kind));
  });
  broadcast();
}

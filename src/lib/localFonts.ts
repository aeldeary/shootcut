/**
 * Fonts from the person's own device for the Studios apps. Nothing is uploaded: the bytes stay in the browser
 * (IndexedDB) and are handed to the app running in the frame (`window.__shootcutFonts`, read by the app).
 * Two ways in, so it works in every browser:
 *  - font files picked by the person (any browser);
 *  - the installed fonts, where the browser offers them (Local Font Access: Chrome, Edge and Opera).
 * Every function is safe when IndexedDB is missing (private modes, tests).
 */
const DB_NAME = 'shootcut-fonts';
const STORE = 'fonts';

export interface SavedFont {
  id: string;
  name: string;
  size: number;
  bytes: ArrayBuffer;
}

export interface InstalledFace {
  family: string;
  fullName: string;
  style: string;
  load: () => Promise<ArrayBuffer>;
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const req = f(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export async function savedFonts(): Promise<SavedFont[]> {
  const all = await run<SavedFont[]>('readonly', (s) => s.getAll() as IDBRequest<SavedFont[]>);
  return (all ?? []).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveFont(name: string, bytes: ArrayBuffer): Promise<SavedFont> {
  const font: SavedFont = { id: `${name}:${bytes.byteLength}`, name, size: bytes.byteLength, bytes };
  await run('readwrite', (s) => s.put(font));
  return font;
}

export async function removeFont(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
}

/** Font files the apps can read. WOFF is a web package, not a font file for them. */
export const FONT_ACCEPT = '.ttf,.otf,.ttc,.otc';

export function isFontFile(name: string): boolean {
  return /\.(ttf|otf|ttc|otc)$/i.test(name);
}

/** Whether the browser can list the installed fonts (Chrome, Edge, Opera: asks the person first). */
export function canListInstalled(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts === 'function';
}

interface LocalFontData {
  family: string;
  fullName: string;
  style: string;
  blob: () => Promise<Blob>;
}

export async function listInstalled(): Promise<InstalledFace[]> {
  const q = (window as unknown as { queryLocalFonts: () => Promise<LocalFontData[]> }).queryLocalFonts;
  const list = await q.call(window);
  return list.map((f) => ({
    family: f.family,
    fullName: f.fullName,
    style: f.style,
    load: async () => (await f.blob()).arrayBuffer(),
  }));
}

/** Hands fonts to the app in the frame. Built with the frame's own Array and Uint8Array so it can read them. */
export function sendFonts(win: Window | null | undefined, fonts: ArrayBuffer[]): boolean {
  if (!win || !fonts.length) return false;
  try {
    const w = win as unknown as { Array: new () => { push: (x: unknown) => void }; Uint8Array: new (b: ArrayBuffer) => unknown; __shootcutFonts?: { push: (x: unknown) => void } };
    if (!w.__shootcutFonts) w.__shootcutFonts = new w.Array();
    for (const b of fonts) w.__shootcutFonts.push(new w.Uint8Array(b));
    return true;
  } catch {
    return false;
  }
}

/** Sends every font kept on this device to the frame (the app reads them as it starts). */
export async function sendSaved(win: Window | null | undefined): Promise<number> {
  const all = await savedFonts();
  sendFonts(win, all.map((f) => f.bytes));
  return all.length;
}

/** Families of installed faces, one entry each, A to Z. */
export function families(faces: InstalledFace[]): string[] {
  return [...new Set(faces.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
}

const AUTO_KEY = 'shootcut-fonts-auto';

/** Whether the person chose to bring in every installed font each time an app opens. */
export function autoImportOn(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAutoImport(on: boolean): void {
  try {
    if (on) localStorage.setItem(AUTO_KEY, '1');
    else localStorage.removeItem(AUTO_KEY);
  } catch {
    /* storage unavailable: the choice only lasts for this visit */
  }
}

/** True when the browser already let this site read the installed fonts (so no question is asked). */
export async function installedFontsGranted(): Promise<boolean> {
  try {
    const st = await navigator.permissions.query({ name: 'local-fonts' as PermissionName });
    return st.state === 'granted';
  } catch {
    return false;
  }
}

/** Faces above this size (huge CJK files) are skipped so the app does not run out of memory. */
export const MAX_FACE_BYTES = 12 * 1024 * 1024;

/**
 * Hands every installed font to the app in the frame, one batch at a time. Nothing is stored or uploaded:
 * the bytes go from the device straight to the app, and the next visit reads them again.
 * Returns how many faces were handed over.
 */
export async function importAllInstalled(
  win: Window | null | undefined,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const faces = await listInstalled();
  let done = 0;
  let sent = 0;
  const BATCH = 8;
  for (let i = 0; i < faces.length; i += BATCH) {
    const chunk = await Promise.all(
      faces.slice(i, i + BATCH).map(async (f) => {
        try {
          const b = await f.load();
          return b.byteLength <= MAX_FACE_BYTES ? b : null;
        } catch {
          return null;
        }
      }),
    );
    const ok = chunk.filter((b): b is ArrayBuffer => !!b);
    if (sendFonts(win, ok)) sent += ok.length;
    done = Math.min(faces.length, i + BATCH);
    onProgress?.(done, faces.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return sent;
}

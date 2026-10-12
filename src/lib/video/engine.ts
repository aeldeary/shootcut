import { FFmpeg } from '@ffmpeg/ffmpeg';
import { parseInfo, type VideoInfo } from './args';

/**
 * The video engine (FFmpeg compiled to WebAssembly, about 32 MB).
 * It is served by this site itself and kept in the browser's own storage (Cache Storage), so it is
 * downloaded once per device. No third-party request is ever made.
 */
export const ENGINE_VERSION = '0.12.10';
const CACHE_NAME = `shootcut-engine-${ENGINE_VERSION}`;
const FILES = [
  { name: 'ffmpeg-core.js', type: 'text/javascript' },
  { name: 'ffmpeg-core.wasm', type: 'application/wasm' },
] as const;

const base = () => new URL('ffmpeg/', document.baseURI).href;
const hasCache = () => typeof caches !== 'undefined';

/** True when the engine is already stored on this device. */
export async function engineCached(): Promise<boolean> {
  if (!hasCache()) return false;
  try {
    const c = await caches.open(CACHE_NAME);
    return (await Promise.all(FILES.map((f) => c.match(base() + f.name)))).every(Boolean);
  } catch {
    return false;
  }
}

/** Removes the stored engine (and any older version). */
export async function clearEngine(): Promise<void> {
  if (!hasCache()) return;
  for (const k of await caches.keys()) if (k.startsWith('shootcut-engine-')) await caches.delete(k);
  loading = null;
  shared = null;
}

async function fetchWithProgress(url: string, onBytes: (n: number) => void): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`engine download failed (${res.status})`);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    onBytes(value.length);
  }
  return new Blob(parts as unknown as BlobPart[], { type: res.headers.get('content-type') ?? '' });
}

async function blobFor(file: (typeof FILES)[number], onBytes: (n: number) => void): Promise<string> {
  const url = base() + file.name;
  let blob: Blob | undefined;
  if (hasCache()) {
    try {
      const hit = await (await caches.open(CACHE_NAME)).match(url);
      if (hit) {
        blob = await hit.blob();
        onBytes(blob.size);
      }
    } catch {
      /* private mode etc.: fall through to the network */
    }
  }
  if (!blob) {
    blob = await fetchWithProgress(url, onBytes);
    if (hasCache()) {
      try {
        await (await caches.open(CACHE_NAME)).put(url, new Response(blob, { headers: { 'content-type': file.type } }));
      } catch {
        /* storage full or blocked: still works, just downloaded again next time */
      }
    }
  }
  return URL.createObjectURL(new Blob([blob], { type: file.type }));
}

let shared: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

/** Loads the engine once per page. `onProgress` gets 0..1 while it downloads (instant when stored). */
export function loadEngine(onProgress?: (fraction: number) => void): Promise<FFmpeg> {
  if (shared) return Promise.resolve(shared);
  if (loading) return loading;
  loading = (async () => {
    // ask the browser not to evict what we store (ignored where unsupported)
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* ignore */
    }
    const total = 32_300_000 + 112_000;
    let got = 0;
    const tick = (n: number) => {
      got += n;
      onProgress?.(Math.min(1, got / total));
    };
    const coreURL = await blobFor(FILES[0], tick);
    const wasmURL = await blobFor(FILES[1], tick);
    const ff = new FFmpeg();
    await ff.load({ coreURL, wasmURL });
    shared = ff;
    onProgress?.(1);
    return ff;
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/** Stops a running job. The engine is loaded again (from the device's storage) on the next use. */
export function cancelEngine(): void {
  try {
    shared?.terminate();
  } catch {
    /* already stopped */
  }
  shared = null;
  loading = null;
}

const extOf = (name: string) => (/\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1] ?? 'bin').toLowerCase();

/** Runs FFmpeg on in-memory files and returns the output. Input names are `in0.ext`, `in1.ext` … */
export async function runFfmpeg(
  files: File[],
  makeArgs: (inputs: string[], output: string) => string[],
  outExt: string,
  onProgress?: (fraction: number) => void,
  onEngine?: (fraction: number) => void,
): Promise<Uint8Array> {
  const ff = await loadEngine(onEngine);
  const inputs = files.map((f, i) => `in${i}.${extOf(f.name)}`);
  const output = `out.${outExt}`;
  const progress = ({ progress: p }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, p)));
  const tail: string[] = [];
  const keep = ({ message }: { message: string }) => {
    tail.push(message);
    if (tail.length > 12) tail.shift();
  };
  ff.on('progress', progress);
  ff.on('log', keep);
  try {
    for (const [i, f] of files.entries()) await ff.writeFile(inputs[i], new Uint8Array(await f.arrayBuffer()));
    const code = await ff.exec(makeArgs(inputs, output));
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}\n${tail.join('\n')}`);
    const data = await ff.readFile(output);
    if (typeof data === 'string') throw new Error('unexpected text output');
    return data.slice(); // copy: the engine's memory is reused by the next job
  } finally {
    ff.off('progress', progress);
    ff.off('log', keep);
    for (const n of [...inputs, output]) {
      try {
        await ff.deleteFile(n);
      } catch {
        /* never created */
      }
    }
  }
}

/** Asks FFmpeg to describe a file (duration, size, codecs, sound). */
export async function probeFile(file: File, onEngine?: (fraction: number) => void): Promise<VideoInfo> {
  const ff = await loadEngine(onEngine);
  const name = `probe.${extOf(file.name)}`;
  let log = '';
  const on = ({ message }: { message: string }) => {
    log += message + '\n';
  };
  ff.on('log', on);
  try {
    await ff.writeFile(name, new Uint8Array(await file.arrayBuffer()));
    await ff.exec(['-hide_banner', '-i', name]); // exits non-zero (no output file) — the description is all we want
  } finally {
    ff.off('log', on);
    try {
      await ff.deleteFile(name);
    } catch {
      /* ignore */
    }
  }
  const p = parseInfo(log);
  return { duration: p.duration ?? 0, width: p.width ?? 0, height: p.height ?? 0, ...p };
}

/** Quick look through the browser's own player (no engine needed); null when it cannot play the file. */
export function readMeta(file: File): Promise<{ duration: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    const done = (r: { duration: number; width: number; height: number } | null) => {
      clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      URL.revokeObjectURL(url);
      resolve(r);
    };
    const timer = setTimeout(() => done(null), 6000);
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) && v.videoWidth > 0 ? { duration: v.duration, width: v.videoWidth, height: v.videoHeight } : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

import { WORKER_POLYFILL } from './polyfills';
import { dropDuplicateRuns } from './ops/textselect';
import { withFixedLigatureMaps } from './tounicode';
import { isEncryptedError } from './source';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
// The worker is a separate JS realm, so it gets the same polyfill before the real worker code loads.
if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL.createObjectURL === 'function') {
  try {
    const abs = new URL(workerUrl, location.href).href;
    const boot = URL.createObjectURL(new Blob([`${WORKER_POLYFILL}\nawait import(${JSON.stringify(abs)});`], { type: 'text/javascript' }));
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(boot, { type: 'module' });
  } catch {
    /* fall back to workerSrc */
  }
}

export type PdfErrorKind = 'encrypted' | 'corrupt' | 'generic';

export function classifyError(err: unknown): PdfErrorKind {
  if (isEncryptedError(err)) return 'encrypted';
  if ((err as { name?: string } | null)?.name === 'PasswordRequiredError') return 'encrypted';
  const name = (err as { name?: string } | null)?.name ?? '';
  const msg = String((err as { message?: string } | null)?.message ?? '');
  if (name === 'PasswordException' || /encrypted|password/i.test(msg)) return 'encrypted';
  if (name === 'InvalidPDFException' || /parse|invalid pdf|no pdf header|failed to parse/i.test(msg)) return 'corrupt';
  return 'generic';
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export async function readBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** Western digits only (0-9), in every UI language. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime = 'application/pdf'): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

let uid = 0;
export function nextId(): string {
  uid += 1;
  return `id-${uid}`;
}

/* ------------------------------------------------------------------ canvas */

/** Minimal canvas surface used by the app (a browser canvas or a Node canvas in tests). */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type CanvasFactory = (width: number, height: number) => CanvasLike;

let canvasFactory: CanvasFactory = (width, height) => {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
};

/** Tests (running outside a browser) provide their own canvas implementation. */
export function setCanvasFactory(fn: CanvasFactory): void {
  canvasFactory = fn;
}

export function createCanvas(width: number, height: number): CanvasLike {
  return canvasFactory(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
}

type ImageDecoder = (bytes: Uint8Array) => Promise<CanvasLike>;

let imageDecoder: ImageDecoder = async (bytes) => {
  const bitmap = await createImageBitmap(new Blob([bytes as unknown as BlobPart]));
  const canvas = createCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
};

/** Tests (running outside a browser) provide their own image decoder. */
export function setImageDecoder(fn: ImageDecoder): void {
  imageDecoder = fn;
}

/** Decodes PNG/JPEG/WebP/GIF/BMP bytes (whatever the browser supports) onto a canvas of the image's size. */
export function decodeImage(bytes: Uint8Array): Promise<CanvasLike> {
  return imageDecoder(bytes);
}

/** Encodes a canvas as PNG, JPEG or WebP bytes. */
export async function canvasToBytes(canvas: CanvasLike, mime: 'image/png' | 'image/jpeg' | 'image/webp', quality = 0.9): Promise<Uint8Array> {
  const c = canvas as unknown as {
    toBlob?: (cb: (b: Blob | null) => void, type?: string, q?: number) => void;
    encode?: (format: 'png' | 'jpeg' | 'webp', quality?: number) => Promise<Uint8Array>;
  };
  if (typeof c.toBlob === 'function') {
    const blob = await new Promise<Blob | null>((resolve) => c.toBlob!(resolve, mime, quality));
    if (!blob) throw new Error('Canvas could not be encoded');
    return new Uint8Array(await blob.arrayBuffer());
  }
  if (typeof c.encode === 'function') {
    return new Uint8Array(await c.encode(mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpeg', Math.round(quality * 100)));
  }
  throw new Error('Unsupported canvas implementation');
}

/* ------------------------------------------------------------------ preview */

export interface TextItem {
  str: string;
  /** PDF user space (points, origin bottom-left): left edge and baseline */
  x: number;
  y: number;
  width: number;
  height: number;
  /** reading direction of the run; matters for locating a substring inside it */
  rtl: boolean;
  /** pdf.js saw a line break right after this run */
  eol: boolean;
  /** the run is rotated (reads up or down the page): its box is not a horizontal strip */
  vertical: false | 'up' | 'down';
}

export interface PageViewportInfo {
  /** size in CSS px at the requested scale, rotation applied */
  width: number;
  height: number;
  scale: number;
  /** viewport (pixel) -> PDF user space point */
  toPdf: (x: number, y: number) => [number, number];
  /** PDF user space point -> viewport (pixel) */
  toView: (x: number, y: number) => [number, number];
}

export interface PdfPreview {
  numPages: number;
  /** Renders page `index` (0-based) to a JPEG data URL, fitted to `maxWidth` CSS px. */
  render: (index: number, maxWidth: number) => Promise<string>;
  /** Page size in points at 100% (rotation applied). */
  pageSize: (index: number) => Promise<{ width: number; height: number }>;
  /** `rotation`: extra clockwise degrees (0/90/180/270) on top of the page's own rotation, for rotating the view only */
  viewport: (index: number, scale: number, rotation?: number) => Promise<PageViewportInfo>;
  /** Draws the page on `canvas` at `scale` (1 = 72 dpi). Resizes the canvas. */
  renderToCanvas: (index: number, canvas: CanvasLike, scale: number, rotation?: number) => Promise<void>;
  textItems: (index: number) => Promise<TextItem[]>;
  destroy: () => void;
}

/** Closings that are still running. pdf.js refuses to open a document while its worker is being torn down. */
const closing = new Set<Promise<unknown>>();
function closeTask(task: { destroy: () => Promise<void> } | null | undefined): void {
  if (!task) return;
  const p = Promise.resolve(task.destroy()).catch(() => undefined);
  closing.add(p);
  void p.finally(() => closing.delete(p));
}

export async function openPreview(bytes: Uint8Array): Promise<PdfPreview> {
  if (closing.size > 0) await Promise.all([...closing]);
  // tests run pdf.js in Node, where these browser URLs do not exist
  const assets = import.meta.env.MODE !== 'test' ? `${import.meta.env.BASE_URL}pdfjs/` : undefined;
  // pdf.js transfers the buffer to its worker, so hand it a copy.
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    // draw glyph outlines instead of loading the fonts into the browser, which re-shapes some InDesign Arabic and scrambles the letters
    disableFontFace: true,
    ...(assets ? { standardFontDataUrl: `${assets}standard_fonts/`, cMapUrl: `${assets}cmaps/`, cMapPacked: true } : {}),
  });
  const doc = await task.promise;

  // text is read from a copy whose Arabic ligature maps are fixed (see tounicode.ts); drawing uses the original
  let textDoc: Promise<pdfjs.PDFDocumentProxy> | null = null;
  let textTask: pdfjs.PDFDocumentLoadingTask | null = null;
  const textSource = (): Promise<pdfjs.PDFDocumentProxy> => {
    textDoc ??= (async () => {
      const fixed = await withFixedLigatureMaps(bytes).catch(() => null);
      if (!fixed) return doc;
      textTask = pdfjs.getDocument({
        data: fixed,
        ...(assets ? { standardFontDataUrl: `${assets}standard_fonts/`, cMapUrl: `${assets}cmaps/`, cMapPacked: true } : {}),
      });
      return textTask.promise.catch(() => doc);
    })();
    return textDoc;
  };

  const viewportInfo = (page: pdfjs.PDFPageProxy, scale: number, rotation = 0): PageViewportInfo => {
    const vp = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
    return {
      width: vp.width,
      height: vp.height,
      scale,
      toPdf: (x, y) => vp.convertToPdfPoint(x, y) as [number, number],
      toView: (x, y) => vp.convertToViewportPoint(x, y) as [number, number],
    };
  };

  const drawTo = async (index: number, canvas: CanvasLike, scale: number, rotation = 0) => {
    const page = await doc.getPage(index + 1);
    const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
    page.cleanup();
  };

  return {
    numPages: doc.numPages,
    async render(index, maxWidth) {
      const page = await doc.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      const canvas = createCanvas(1, 1);
      await drawTo(index, canvas, (maxWidth / base.width) * dpr);
      return `data:image/jpeg;base64,${toBase64(await canvasToBytes(canvas, 'image/jpeg', 0.8))}`;
    },
    async pageSize(index) {
      const page = await doc.getPage(index + 1);
      const vp = page.getViewport({ scale: 1 });
      return { width: vp.width, height: vp.height };
    },
    async viewport(index, scale, rotation) {
      return viewportInfo(await doc.getPage(index + 1), scale, rotation);
    },
    renderToCanvas: drawTo,
    async textItems(index) {
      const page = await (await textSource()).getPage(index + 1);
      const content = await page.getTextContent();
      const out: TextItem[] = [];
      for (const it of content.items) {
        if (!('str' in it) || !it.str) continue;
        const t = it.transform as number[];
        out.push({
          str: it.str,
          x: t[4],
          y: t[5],
          width: it.width,
          height: it.height || Math.hypot(t[2], t[3]),
          rtl: it.dir === 'rtl',
          eol: !!it.hasEOL,
          vertical: Math.abs(t[1]) > Math.abs(t[0]) * 2 ? (t[1] > 0 ? 'up' : 'down') : false,
        });
      }
      return dropDuplicateRuns(out);
    },
    destroy() {
      closeTask(task);
      closeTask(textTask);
    },
  };
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(s);
}

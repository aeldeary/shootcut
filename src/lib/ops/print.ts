import { canvasToBytes, createCanvas, toBase64, type CanvasLike, type PdfPreview } from '../pdf';

export type PrintColor = 'color' | 'gray' | 'bw';

export interface PrintOptions {
  color: PrintColor;
  /** black-and-white cut-off, 0-255: pixels darker than this print black */
  threshold?: number;
  /** render resolution */
  dpi?: number;
}

export interface PrintPage {
  /** data URL of the page, already in the chosen colour mode */
  url: string;
  /** page size in points */
  width: number;
  height: number;
}

type Ctx = { getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray }; putImageData: (d: unknown, x: number, y: number) => void };

/** Converts the pixels of a rendered page in place: grey tones, or pure black and white. */
export function applyPrintColor(canvas: CanvasLike, color: PrintColor, threshold = 170): void {
  if (color === 'color') return;
  const ctx = canvas.getContext('2d') as Ctx;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    const v = color === 'bw' ? (g < threshold ? 0 : 255) : g;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export async function renderPrintPage(preview: PdfPreview, index: number, o: PrintOptions): Promise<PrintPage> {
  const size = await preview.pageSize(index);
  const scale = Math.min((o.dpi ?? 200) / 72, 4000 / Math.max(size.width, size.height));
  const canvas = createCanvas(1, 1);
  await preview.renderToCanvas(index, canvas, scale);
  applyPrintColor(canvas, o.color, o.threshold);
  // black and white compresses best as PNG; photos and greys as JPEG
  const png = o.color === 'bw';
  const bytes = await canvasToBytes(canvas, png ? 'image/png' : 'image/jpeg', 0.92);
  return { url: `data:${png ? 'image/png' : 'image/jpeg'};base64,${toBase64(bytes)}`, width: size.width, height: size.height };
}

export async function renderPrintPages(preview: PdfPreview, pages: number[], o: PrintOptions, onPage?: (done: number, total: number) => void): Promise<PrintPage[]> {
  const out: PrintPage[] = [];
  for (const [i, p] of pages.entries()) {
    out.push(await renderPrintPage(preview, p, o));
    onPage?.(i + 1, pages.length);
  }
  return out;
}

/** 'landscape' / 'portrait' when every page agrees, so the print dialog can start with the right paper direction. */
export function commonOrientation(pages: { width: number; height: number }[]): 'landscape' | 'portrait' | 'auto' {
  if (pages.length === 0) return 'auto';
  const land = pages.filter((p) => p.width > p.height).length;
  if (land === pages.length) return 'landscape';
  if (land === 0) return 'portrait';
  return 'auto';
}

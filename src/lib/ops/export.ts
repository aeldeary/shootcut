import { zipSync } from 'fflate';
import { baseName, canvasToBytes, createCanvas, type PdfPreview } from '../pdf';

export interface ExportOptions {
  format: 'png' | 'jpeg';
  /** output resolution; 72 = one pixel per PDF point */
  dpi: number;
  /** JPEG quality 0..1 */
  quality?: number;
  /** 0-based page indices */
  pages: number[];
  fileName: string;
}

export interface ExportedFile {
  name: string;
  bytes: Uint8Array;
}

export async function exportImages(
  preview: PdfPreview,
  o: ExportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<ExportedFile[]> {
  const digits = String(preview.numPages).length;
  const stem = baseName(o.fileName) || 'page';
  const ext = o.format === 'png' ? 'png' : 'jpg';
  const out: ExportedFile[] = [];
  for (const [i, index] of o.pages.entries()) {
    const canvas = createCanvas(1, 1);
    await preview.renderToCanvas(index, canvas, o.dpi / 72);
    const bytes = await canvasToBytes(canvas, o.format === 'png' ? 'image/png' : 'image/jpeg', o.quality ?? 0.92);
    out.push({ name: `${stem}-${String(index + 1).padStart(digits, '0')}.${ext}`, bytes });
    onProgress?.(i + 1, o.pages.length);
  }
  return out;
}

/** Zips already-compressed images without recompressing them. */
export function zipFiles(files: ExportedFile[]): Uint8Array {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const f of files) entries[f.name] = [f.bytes, { level: 0 }];
  return zipSync(entries);
}

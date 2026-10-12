import { PDFDocument } from 'pdf-lib';
import type { PdfPreview } from '../pdf';
import { readProperties, type PdfProperties } from './properties';

export interface PaperSize {
  /** A4, Letter... or null when the size is not a standard one */
  name: string | null;
  widthMm: number;
  heightMm: number;
  landscape: boolean;
}

const PT_TO_MM = 25.4 / 72;
const PAPERS: [string, number, number][] = [
  ['A0', 841, 1189], ['A1', 594, 841], ['A2', 420, 594], ['A3', 297, 420], ['A4', 210, 297], ['A5', 148, 210], ['A6', 105, 148],
  ['Letter', 215.9, 279.4], ['Legal', 215.9, 355.6], ['Tabloid', 279.4, 431.8],
];

/** Names a page size (points) when it matches a standard paper within 2 mm. */
export function paperSize(widthPt: number, heightPt: number): PaperSize {
  const w = widthPt * PT_TO_MM;
  const h = heightPt * PT_TO_MM;
  const [short, long] = w <= h ? [w, h] : [h, w];
  const hit = PAPERS.find(([, pw, ph]) => Math.abs(pw - short) <= 2 && Math.abs(ph - long) <= 2);
  return { name: hit ? hit[0] : null, widthMm: Math.round(w), heightMm: Math.round(h), landscape: w > h };
}

export type ContentKind = 'text' | 'scanned' | 'mixed' | 'unknown';

export interface Inspection {
  pages: number;
  /** distinct page sizes, most common first */
  sizes: { size: PaperSize; count: number }[];
  content: ContentKind;
  /** number of fillable form fields (0 when none) */
  formFields: number;
  props: PdfProperties | null;
}

/** Up to `n` page indexes spread over the document. */
export function samplePages(total: number, n: number): number[] {
  if (total <= n) return Array.from({ length: total }, (_, i) => i);
  return Array.from(new Set(Array.from({ length: n }, (_, i) => Math.round((i * (total - 1)) / (n - 1)))));
}

/** Reads what a person wants to know before opening a file: size, paper, text or scan, form fields, metadata. */
export async function inspectPdf(bytes: Uint8Array, preview: PdfPreview): Promise<Inspection> {
  const pages = preview.numPages;
  const counts = new Map<string, { size: PaperSize; count: number }>();
  const limit = Math.min(pages, 300);
  for (let i = 0; i < limit; i++) {
    const s = await preview.pageSize(i).catch(() => null);
    if (!s) continue;
    const p = paperSize(s.width, s.height);
    const key = `${p.name ?? 'custom'}-${p.widthMm}x${p.heightMm}`;
    const cur = counts.get(key);
    if (cur) cur.count += 1;
    else counts.set(key, { size: p, count: 1 });
  }

  let withText = 0;
  const sample = samplePages(pages, 6);
  for (const i of sample) {
    const items = await preview.textItems(i).catch(() => []);
    if (items.some((it) => it.str.trim().length > 0)) withText += 1;
  }
  const content: ContentKind = sample.length === 0 ? 'unknown' : withText === sample.length ? 'text' : withText === 0 ? 'scanned' : 'mixed';

  let formFields = 0;
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
    formFields = doc.getForm().getFields().length;
  } catch {
    /* a file whose form cannot be read simply shows no form */
  }
  const props = await readProperties(bytes).catch(() => null);

  return { pages, sizes: [...counts.values()].sort((a, b) => b.count - a.count), content, formFields, props };
}

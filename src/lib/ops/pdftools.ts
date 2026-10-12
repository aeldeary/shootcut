import { PDFDocument, PDFName } from 'pdf-lib';
import { baseName } from '../pdf';
import { parsePageRange } from '../range';

/** Builds a new PDF from the given pages (0-based, in the order given) of `bytes`. */
export async function extractPdfPages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { updateMetadata: false });
  const out = await PDFDocument.create();
  for (const page of await out.copyPages(src, indices)) out.addPage(page);
  out.setProducer('Shootcut');
  return out.save();
}

/** The pages that are not in `indices`. */
export function complement(total: number, indices: number[]): number[] {
  const drop = new Set(indices);
  return Array.from({ length: total }, (_, i) => i).filter((i) => !drop.has(i));
}

export type SplitMode = { kind: 'ranges'; text: string } | { kind: 'every'; n: number } | { kind: 'each' };

/** Which pages go to which file. null when the ranges cannot be read. */
export function splitGroups(total: number, mode: SplitMode): number[][] | null {
  if (mode.kind === 'each') return Array.from({ length: total }, (_, i) => [i]);
  if (mode.kind === 'every') {
    const n = Math.floor(mode.n);
    if (!(n >= 1)) return null;
    const groups: number[][] = [];
    for (let i = 0; i < total; i += n) groups.push(Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k));
    return groups;
  }
  const parts = mode.text.split(/[,،;]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const groups: number[][] = [];
  for (const part of parts) {
    const g = parsePageRange(part, total);
    if (!g) return null;
    groups.push(g);
  }
  return groups;
}

const label = (pages: number[]): string => {
  if (pages.length === 1) return `${pages[0] + 1}`;
  const consecutive = pages.every((p, i) => i === 0 || p === pages[i - 1] + 1);
  return consecutive ? `${pages[0] + 1}-${pages[pages.length - 1] + 1}` : pages.map((p) => p + 1).join('_');
};

export async function splitPdf(bytes: Uint8Array, fileName: string, mode: SplitMode): Promise<{ name: string; bytes: Uint8Array }[]> {
  const src = await PDFDocument.load(bytes, { updateMetadata: false });
  const groups = splitGroups(src.getPageCount(), mode);
  if (!groups) throw new Error('bad split');
  const stem = baseName(fileName) || 'document';
  const files: { name: string; bytes: Uint8Array }[] = [];
  for (const g of groups) {
    const out = await PDFDocument.create();
    for (const page of await out.copyPages(src, g)) out.addPage(page);
    out.setProducer('Shootcut');
    files.push({ name: `${stem}-${g.length === 1 ? 'page' : 'pages'}-${label(g)}.pdf`, bytes: await out.save() });
  }
  return files;
}

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Margins as the reader sees the page, turned into margins of the unrotated page (what the PDF stores). */
export function marginsForRotation(m: Margins, rotation: number): Margins {
  const r = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  if (r === 90) return { left: m.top, top: m.right, right: m.bottom, bottom: m.left };
  if (r === 180) return { left: m.right, right: m.left, top: m.bottom, bottom: m.top };
  if (r === 270) return { left: m.bottom, top: m.left, right: m.top, bottom: m.right };
  return m;
}

/** Cuts the margins off the chosen pages (points). The page really becomes smaller: both boxes are set. */
export async function cropPdf(bytes: Uint8Array, margins: Margins, pages: number[] | null): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const all = doc.getPages();
  for (const i of pages ?? all.map((_, k) => k)) {
    const page = all[i];
    const box = page.getCropBox();
    const m = marginsForRotation(margins, page.getRotation().angle);
    const w = box.width - m.left - m.right;
    const h = box.height - m.top - m.bottom;
    if (w < 10 || h < 10) throw new Error(`margins too large for page ${i + 1}`);
    const x = box.x + m.left;
    const y = box.y + m.bottom;
    page.setCropBox(x, y, w, h);
    page.setMediaBox(x, y, w, h);
    // an old TrimBox/BleedBox bigger than the new page would confuse some viewers
    page.node.delete(PDFName.of('TrimBox'));
    page.node.delete(PDFName.of('BleedBox'));
  }
  doc.setProducer('Shootcut');
  return doc.save();
}

export interface RepairResult {
  bytes: Uint8Array;
  pages: number;
  /** 'copy' keeps text and links; 'pictures' redraws every page as a picture (text is lost) */
  how: 'copy' | 'pictures';
  /** pages that could not be copied and were skipped */
  skipped: number;
}

/**
 * Rebuilds a PDF whose structure is damaged. First tries to copy every page into a clean file (keeps text);
 * `fallback` (page pictures from a tolerant reader) is used only when that fails.
 */
export async function repairPdf(bytes: Uint8Array, fallback?: () => Promise<Uint8Array | null>): Promise<RepairResult> {
  try {
    const src = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false, ignoreEncryption: false });
    const out = await PDFDocument.create();
    let skipped = 0;
    const count = src.getPageCount();
    try {
      // all at once, so fonts and images shared by many pages are copied once
      for (const page of await out.copyPages(src, Array.from({ length: count }, (_, i) => i))) out.addPage(page);
    } catch {
      // a damaged page breaks the batch: copy page by page and leave out the ones that cannot be copied
      for (let i = out.getPageCount(); i < count; i++) {
        try {
          const [page] = await out.copyPages(src, [i]);
          out.addPage(page);
        } catch {
          skipped++;
        }
      }
    }
    if (out.getPageCount() > 0) {
      out.setProducer('Shootcut');
      return { bytes: await out.save(), pages: out.getPageCount(), how: 'copy', skipped };
    }
  } catch {
    /* fall through to the picture rebuild */
  }
  const rebuilt = fallback ? await fallback() : null;
  if (!rebuilt) throw new Error('unrecoverable');
  const pages = (await PDFDocument.load(rebuilt, { updateMetadata: false })).getPageCount();
  return { bytes: rebuilt, pages, how: 'pictures', skipped: 0 };
}


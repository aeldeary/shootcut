import { PDFDocument, PDFName, rgb, type PDFEmbeddedPage } from 'pdf-lib';

export type SheetSize = 'a4' | 'a3' | 'letter';
const SHEETS: Record<SheetSize, [number, number]> = { a4: [595.28, 841.89], a3: [841.89, 1190.55], letter: [612, 792] };

export interface NUpOptions {
  cols: number;
  rows: number;
  sheet: SheetSize;
  landscape: boolean;
  /** space around the sheet and between pages, in points */
  margin: number;
  border: boolean;
  /** reading order for right-to-left languages: the first page goes in the top-right cell */
  rtl: boolean;
}

/** Where page `i` goes in a grid, as a box (x, y from the bottom-left corner). */
export function cellBox(i: number, o: NUpOptions, sheetW: number, sheetH: number) {
  const gap = o.margin;
  const cw = (sheetW - gap * (o.cols + 1)) / o.cols;
  const ch = (sheetH - gap * (o.rows + 1)) / o.rows;
  const col = i % o.cols;
  const row = Math.floor(i / o.cols) % o.rows;
  const c = o.rtl ? o.cols - 1 - col : col;
  return { x: gap + c * (cw + gap), y: sheetH - gap - (row + 1) * ch - row * gap, w: cw, h: ch };
}

async function embedAll(out: PDFDocument, src: PDFDocument): Promise<PDFEmbeddedPage[]> {
  // a page with no content at all (a blank page) cannot be embedded: give it an empty one
  for (const p of src.getPages()) if (!p.node.has(PDFName.of('Contents'))) p.node.set(PDFName.of('Contents'), src.context.register(src.context.stream('')));
  return out.embedPages(src.getPages());
}

function fit(p: PDFEmbeddedPage, box: { x: number; y: number; w: number; h: number }) {
  const k = Math.min(box.w / p.width, box.h / p.height);
  const w = p.width * k;
  const h = p.height * k;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, width: w, height: h };
}

/** Several pages on each sheet (2, 4, 6, 9 ... up). */
export async function nUpPdf(bytes: Uint8Array, o: NUpOptions): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const pages = await embedAll(out, src);
  let [w, h] = SHEETS[o.sheet];
  if (o.landscape) [w, h] = [h, w];
  const per = o.cols * o.rows;
  for (let start = 0; start < pages.length; start += per) {
    const sheet = out.addPage([w, h]);
    for (let k = 0; k < per && start + k < pages.length; k++) {
      const box = cellBox(k, o, w, h);
      const place = fit(pages[start + k], box);
      sheet.drawPage(pages[start + k], place);
      if (o.border) sheet.drawRectangle({ x: place.x, y: place.y, width: place.width, height: place.height, borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 0.5 });
    }
  }
  return out.save();
}

/**
 * The order of pages on the sides of the sheets of a booklet: [left, right] per side, null for a blank.
 * Fold the printed sheets in half and the pages come out in order. `rtl` swaps the sides (right-bound books).
 */
export function bookletOrder(count: number, rtl = false): ([number | null, number | null])[] {
  const total = Math.ceil(Math.max(count, 1) / 4) * 4;
  const pg = (i: number) => (i < count ? i : null);
  const sides: [number | null, number | null][] = [];
  for (let k = 0; k < total / 4; k++) {
    sides.push([pg(total - 1 - 2 * k), pg(2 * k)]); // front: last | first
    sides.push([pg(2 * k + 1), pg(total - 2 - 2 * k)]); // back
  }
  return rtl ? sides.map(([a, b]) => [b, a]) : sides;
}

/** A print-ready booklet: two pages side by side on each sheet side, in the order that folds into a book. */
export async function bookletPdf(bytes: Uint8Array, sheet: SheetSize, rtl: boolean): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const pages = await embedAll(out, src);
  const [sw, sh] = SHEETS[sheet];
  const [w, h] = [sh, sw]; // landscape
  for (const [left, right] of bookletOrder(pages.length, rtl)) {
    const s = out.addPage([w, h]);
    ([left, right] as (number | null)[]).forEach((idx, side) => {
      if (idx === null) return;
      s.drawPage(pages[idx], fit(pages[idx], { x: (side * w) / 2, y: 0, w: w / 2, h }));
    });
  }
  return out.save();
}

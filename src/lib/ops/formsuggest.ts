import { createCanvas, type PdfPreview, type TextItem } from '../pdf';
import type { NewFieldKind } from './formbuild';
import type { Rect } from './textselect';

/**
 * Looks at a page the way a person would and proposes where fillable fields belong: empty cells of a table,
 * dotted or underscore lines, plain ruled lines, and labels that end with a colon and have empty room beside them.
 * Works on a grey picture of the page (so it also copes with scans and with tables drawn as pictures) plus the text positions.
 */

export interface Mapper {
  toPdf: (x: number, y: number) => [number, number];
  toView: (x: number, y: number) => [number, number];
}

export interface RasterPage {
  /** 0 (black) .. 255 (white), row by row */
  gray: Uint8Array;
  width: number;
  height: number;
}

export type SuggestionSource = 'cell' | 'blank' | 'line' | 'label';

export interface Suggestion {
  /** PDF user space */
  rect: Rect;
  kind: NewFieldKind;
  source: SuggestionSource;
  /** nearby text that says what the field is for, if any */
  label?: string;
}

export interface PageAnalysis {
  suggestions: Suggestion[];
  /** bordered cells found, empty or not: a table has many */
  cells: number;
  tableLike: boolean;
  hasText: boolean;
}

const INK = 170;
type Box = { l: number; t: number; r: number; b: number }; // view pixels, r/b exclusive

const area = (b: Box) => Math.max(0, b.r - b.l) * Math.max(0, b.b - b.t);
const inter = (a: Box, b: Box) => area({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });

function textBox(it: TextItem, map: Mapper): Box {
  const [x1, y1] = map.toView(it.x, it.y);
  const [x2, y2] = map.toView(it.x + it.width, it.y + Math.max(it.height, 1));
  return { l: Math.min(x1, x2), t: Math.min(y1, y2), r: Math.max(x1, x2), b: Math.max(y1, y2) };
}

function toPdfRect(b: Box, map: Mapper): Rect {
  const [x1, y1] = map.toPdf(b.l, b.t);
  const [x2, y2] = map.toPdf(b.r, b.b);
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

/** Connected areas of white (4-neighbours). Returns the label of every pixel (0 = ink) and each area's box and size. */
function whiteAreas(r: RasterPage): { label: Int32Array; boxes: (Box & { n: number })[] } {
  const { gray, width: w, height: h } = r;
  const label = new Int32Array(w * h);
  const boxes: (Box & { n: number })[] = [{ l: 0, t: 0, r: 0, b: 0, n: 0 }];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (label[start] || gray[start] < INK) continue;
    const id = boxes.length;
    const box = { l: w, t: h, r: 0, b: 0, n: 0 };
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      box.n++;
      if (x < box.l) box.l = x;
      if (x + 1 > box.r) box.r = x + 1;
      if (y < box.t) box.t = y;
      if (y + 1 > box.b) box.b = y + 1;
      if (x > 0 && !label[p - 1] && gray[p - 1] >= INK) { label[p - 1] = id; stack[sp++] = p - 1; }
      if (x < w - 1 && !label[p + 1] && gray[p + 1] >= INK) { label[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && !label[p - w] && gray[p - w] >= INK) { label[p - w] = id; stack[sp++] = p - w; }
      if (y < h - 1 && !label[p + w] && gray[p + w] >= INK) { label[p + w] = id; stack[sp++] = p + w; }
    }
    boxes.push(box);
  }
  return { label, boxes };
}

/** Text that says what a field is for: the neighbour on the same row, else the nearest text above. */
export function labelFor(field: Box, texts: { it: TextItem; box: Box }[], pt: number): string | undefined {
  const rowH = field.b - field.t;
  const sameRow = texts
    .filter(({ box }) => Math.min(box.b, field.b) - Math.max(box.t, field.t) > Math.min(rowH, box.b - box.t) * 0.5)
    .map(({ it, box }) => ({ it, gap: box.r < field.l ? field.l - box.r : box.l > field.r ? box.l - field.r : Infinity }))
    .filter((x) => x.gap < 300 * pt)
    .sort((a, b) => a.gap - b.gap);
  let pick = sameRow[0]?.it;
  if (!pick) {
    const above = texts
      .filter(({ box }) => box.b <= field.t + 2 && Math.min(box.r, field.r) - Math.max(box.l, field.l) > 0 && field.t - box.b < 40 * pt)
      .sort((a, b) => b.box.b - a.box.b);
    pick = above[0]?.it;
  }
  const s = pick?.str.replace(/[:：_.…\s]+$/g, '').replace(/^[\s_.…]+/, '').trim();
  return s ? s.slice(0, 40) : undefined;
}

export function analyzePage(r: RasterPage, items: TextItem[], map: Mapper, scale: number): PageAnalysis {
  const pt = scale; // pixels per point
  const texts = items.filter((it) => it.str.trim()).map((it) => ({ it, box: textBox(it, map) }));
  const found: (Suggestion & { box: Box; rank: number })[] = [];
  const add = (box: Box, kind: NewFieldKind, source: SuggestionSource, rank: number) => {
    if (found.some((f) => inter(f.box, box) > 0.3 * Math.min(area(f.box), area(box)))) return;
    found.push({ box, kind, source, rank, rect: toPdfRect(box, map), label: labelFor(box, texts, pt) });
  };

  // 1. bordered cells and boxes: white areas that are closed in by lines and hold nothing
  const { boxes } = whiteAreas(r);
  let cells = 0;
  const pageArea = r.width * r.height;
  for (let id = 1; id < boxes.length; id++) {
    const c = boxes[id];
    const w = c.r - c.l;
    const h = c.b - c.t;
    if (c.l <= 1 || c.t <= 1 || c.r >= r.width - 1 || c.b >= r.height - 1) continue; // touches the paper edge: the background
    if (w * h > pageArea * 0.6) continue;
    const fill = c.n / (w * h);
    if (fill < 0.55) continue;
    const insideText = texts.some(({ box }) => {
      const cx = (box.l + box.r) / 2;
      const cy = (box.t + box.b) / 2;
      return cx > c.l && cx < c.r && cy > c.t && cy < c.b;
    });
    const wp = w / pt;
    const hp = h / pt;
    const square = wp >= 6 && wp <= 22 && hp >= 6 && hp <= 22 && Math.abs(wp - hp) <= 3;
    if (square) {
      // a tick box, unless it is just the hole of a big letter
      const glyphHole = texts.some(({ box }) => c.l >= box.l - 1 && c.r <= box.r + 1 && c.t >= box.t - 1 && c.b <= box.b + 1);
      if (!glyphHole && fill >= 0.93) add({ l: c.l, t: c.t, r: c.r, b: c.b }, 'checkbox', 'cell', 1);
      continue;
    }
    if (wp < 22 || hp < 9) continue;
    cells++;
    if (insideText || fill < 0.97) continue; // already holds something
    const pad = Math.min(2, h * 0.1) ;
    const box = { l: c.l + pad, t: c.t + pad, r: c.r - pad, b: c.b - pad };
    add(box, hp > 45 && wp > 120 ? 'multiline' : 'text', 'cell', 0);
  }

  // 2. dotted or underscore runs in the text: "Name: ________"
  for (const { it, box } of texts) {
    const m = /[_.…·\-–]{4,}/.exec(it.str);
    if (!m || (m[0].match(/[A-Za-z0-9؀-ۿ]/) ?? []).length) continue;
    const len = it.str.length;
    let a = m.index / len;
    let b = (m.index + m[0].length) / len;
    if (it.rtl) [a, b] = [1 - b, 1 - a];
    const wBox = box.r - box.l;
    // underscores hang just below the baseline: the field goes on the line, a little above it
    add({ l: box.l + a * wBox, t: box.b - 14 * pt, r: box.l + b * wBox, b: box.b + 2 * pt }, 'text', 'blank', 2);
  }

  // 3. plain ruled lines that are not the edge of a cell: a field sits on top of them
  const minRun = Math.round(50 * pt);
  const used = found.map((f) => f.box);
  for (let y = 2; y < r.height - 2; y++) {
    let x = 0;
    while (x < r.width) {
      while (x < r.width && r.gray[y * r.width + x] >= INK) x++;
      const x0 = x;
      while (x < r.width && r.gray[y * r.width + x] < INK) x++;
      if (x - x0 < minRun) continue;
      // thin: nothing dark two pixels below the line
      const below = Math.round(3 * pt);
      let thin = true;
      for (let k = below; k <= below + 1; k++) {
        const yy = Math.min(r.height - 1, y + k);
        let dark = 0;
        for (let xx = x0; xx < x; xx++) if (r.gray[yy * r.width + xx] < INK) dark++;
        if (dark > (x - x0) * 0.5) thin = false;
      }
      if (!thin) continue;
      const hgt = Math.round(18 * pt);
      const field = { l: x0 + 2, t: y - hgt, r: x - 2, b: y - 1 };
      // the edge of a table cell, or a line with text sitting right on it, is not a blank line
      const textOnTop = texts.some(({ box }) => inter(box, { l: x0, t: y - hgt, r: x, b: y }) > area(box) * 0.35);
      const nearCell = used.some((u) => Math.abs(u.b - y) < 4 * pt && u.r > x0 && u.l < x) || used.some((u) => Math.abs(u.t - y) < 4 * pt && u.r > x0 && u.l < x);
      const inkAbove = (() => {
        let dark = 0;
        const rows = Math.round(8 * pt);
        for (let yy = Math.max(0, y - rows); yy < y - 1; yy++) for (let xx = x0; xx < x; xx += 2) if (r.gray[yy * r.width + xx] < INK) dark++;
        return dark > (x - x0) * rows * 0.01;
      })();
      if (!textOnTop && !nearCell && !inkAbove) add(field, 'text', 'line', 3);
    }
  }

  // 4. "Name:" with free room next to it
  const lineH = (b: Box) => b.b - b.t;
  for (const { it, box } of texts) {
    if (!/[:：]\s*$/.test(it.str) || it.str.trim().length < 3) continue;
    const h = Math.max(lineH(box), 11 * pt);
    const side = it.rtl ? -1 : 1;
    const width = 150 * pt;
    const field: Box = side > 0 ? { l: box.r + 4, t: box.t - 2, r: box.r + 4 + width, b: box.t + h + 2 } : { l: box.l - 4 - width, t: box.t - 2, r: box.l - 4, b: box.t + h + 2 };
    field.l = Math.max(field.l, 4);
    field.r = Math.min(field.r, r.width - 4);
    if (field.r - field.l < 40 * pt) continue;
    const crowded = texts.some(({ box: o }) => o !== box && inter(o, field) > 0);
    if (crowded) continue;
    let dark = 0;
    for (let yy = Math.max(0, Math.floor(field.t)); yy < Math.min(r.height, Math.ceil(field.b)); yy++) {
      for (let xx = Math.floor(field.l); xx < Math.ceil(field.r); xx += 2) if (r.gray[yy * r.width + xx] < INK) dark++;
    }
    if (dark > area(field) * 0.01) continue;
    add(field, 'text', 'label', 4);
  }

  found.sort((a, b) => a.rank - b.rank || a.box.t - b.box.t || a.box.l - b.box.l);
  const suggestions = found.map(({ rect, kind, source, label }) => ({ rect, kind, source, label }));
  return { suggestions, cells, tableLike: cells >= 4, hasText: texts.length > 0 };
}

export type DocumentKind = 'table' | 'lines' | 'none';

export interface DocumentAnalysis {
  kind: DocumentKind;
  /** pages that were looked at: index and what was found there */
  pages: { page: number; suggestions: Suggestion[] }[];
  total: number;
  scanned: boolean;
  /** the file has too many pages to look at them all */
  partial: boolean;
}

export function summarize(pages: { page: number; analysis: PageAnalysis }[], totalPages: number): DocumentAnalysis {
  const all = pages.flatMap((p) => p.analysis.suggestions);
  const table = pages.some((p) => p.analysis.tableLike) && all.some((s) => s.source === 'cell');
  const kind: DocumentKind = all.length === 0 ? 'none' : table ? 'table' : 'lines';
  return {
    kind,
    pages: pages.map((p) => ({ page: p.page, suggestions: p.analysis.suggestions })),
    total: all.length,
    scanned: pages.length > 0 && pages.every((p) => !p.analysis.hasText),
    partial: pages.length < totalPages,
  };
}

const SCALE = 1.5;

/** Looks at up to `maxPages` pages of a file and says where fields probably belong. */
export async function analyzeDocument(preview: PdfPreview, maxPages = 30, onProgress?: (done: number, total: number) => void): Promise<DocumentAnalysis> {
  const count = Math.min(preview.numPages, maxPages);
  const done: { page: number; analysis: PageAnalysis }[] = [];
  for (let i = 0; i < count; i++) {
    const vp = await preview.viewport(i, SCALE);
    const canvas = createCanvas(vp.width, vp.height);
    await preview.renderToCanvas(i, canvas, SCALE);
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const gray = new Uint8Array(canvas.width * canvas.height);
    for (let p = 0; p < gray.length; p++) {
      const o = p * 4;
      const a = img.data[o + 3] / 255;
      // transparent paper counts as white
      gray[p] = Math.round((0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2]) * a + 255 * (1 - a));
    }
    const items = await preview.textItems(i);
    done.push({ page: i, analysis: analyzePage({ gray, width: canvas.width, height: canvas.height }, items, { toPdf: vp.toPdf, toView: vp.toView }, SCALE) });
    onProgress?.(i + 1, count);
  }
  return summarize(done, preview.numPages);
}

import type { TextItem } from '../pdf';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Normalizes two corner points into a rectangle with positive size. */
export function rectFromPoints(a: [number, number], b: [number, number]): Rect {
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(a[0] - b[0]), height: Math.abs(a[1] - b[1]) };
}

/**
 * Some designs draw the same text twice (a shadow, an outline) or a short run on top of a longer one that
 * contains it. Keeps one copy so the words are not read twice.
 */
export function dropDuplicateRuns(items: TextItem[]): TextItem[] {
  const tol = 1.5;
  return items.filter((it, i) => {
    const s = it.str.trim();
    if (!s) return true;
    return !items.some((o, j) => {
      if (j === i || it.vertical !== o.vertical) return false;
      if (Math.abs(o.y - it.y) > tol || Math.abs(o.height - it.height) > it.height * 0.35 + tol) return false;
      if (it.x < o.x - tol || it.x + it.width > o.x + o.width + tol) return false;
      if (!o.str.includes(s)) return false;
      // identical runs: keep the first; otherwise the one that contains the other wins
      return o.str.length > it.str.length || j < i;
    });
  });
}

/** Vertical band a text run occupies (baseline sits about 20% above the bottom of the glyph box). */
function band(i: TextItem): [number, number] {
  return [i.y - i.height * 0.22, i.y + i.height * 0.82];
}

/**
 * Turns a dragged region into line-shaped rectangles over the text it touches: runs whose line band is
 * mostly inside the region are cut to the region's horizontal span. Returns [] when the region covers no text.
 */
export function textRectsInRegion(items: TextItem[], region: Rect): Rect[] {
  const out: Rect[] = [];
  for (const item of items) {
    if (item.width <= 0 || item.height <= 0 || item.vertical) continue;
    const [bottom, top] = band(item);
    const overlap = Math.min(top, region.y + region.height) - Math.max(bottom, region.y);
    if (overlap < (top - bottom) * 0.4) continue;
    const x0 = Math.max(item.x, region.x);
    const x1 = Math.min(item.x + item.width, region.x + region.width);
    if (x1 - x0 < 1) continue;
    out.push({ x: x0, y: bottom, width: x1 - x0, height: top - bottom });
  }
  return mergeLineRects(out);
}

/** Removes decorative letter-stretching (tatweel), but keeps the one in abbreviations such as "هـ". */
export function stripTatweel(text: string): string {
  return text
    .split(/(\s+)/)
    .map((tok) => (/^\p{L}\u0640$/u.test(tok) ? tok : tok.replace(/\u0640+/g, '')))
    .join('');
}

/** Joins rectangles that sit on the same line and touch each other. */
export function mergeLineRects(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => b.y - a.y || a.x - b.x);
  const merged: Rect[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.y - r.y) < 2 && Math.abs(last.height - r.height) < 3 && r.x <= last.x + last.width + 4) {
      const right = Math.max(last.x + last.width, r.x + r.width);
      last.width = right - last.x;
    } else merged.push({ ...r });
  }
  return merged;
}

/**
 * Makes searching forgiving without changing the length of the text (positions depend on it): ignores case,
 * and treats the forms of alef (أ إ آ ٱ) as one letter and ى as ي.
 */
export function normalizeSearch(s: string): string {
  return s.toLowerCase().replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي');
}

/** Finds every occurrence of `query` and returns the boxes that cover it, slightly padded. */
export function findTextBoxes(items: TextItem[], query: string, normalize: (s: string) => string = (s) => s.toLowerCase()): Rect[] {
  // stretched letters (tatweel) are decoration: searching for "توزيع" must also find "توزيــع"
  const needle = normalize(query.trim()).replace(/\u0640/g, '');
  if (!needle) return [];
  const out: Rect[] = [];
  for (const item of items) {
    const n = item.str.length;
    if (!n || item.width <= 0 || item.vertical) continue;
    const norm = normalize(item.str);
    let hay = '';
    const map: number[] = []; // index in `hay` -> index in the original text
    for (let i = 0; i < n; i++) {
      if (norm[i] === '\u0640') continue;
      hay += norm[i];
      map.push(i);
    }
    const perChar = item.width / n;
    for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) {
      const from = map[at];
      const to = map[at + needle.length - 1] + 1;
      // in a right-to-left run the first letter sits at the right edge
      const startChar = item.rtl ? n - to : from;
      const pad = perChar * 0.35;
      const x = Math.max(item.x, item.x + startChar * perChar - pad);
      const right = Math.min(item.x + item.width, item.x + (startChar + (to - from)) * perChar + pad);
      const [bottom, top] = band(item);
      out.push({ x, y: bottom, width: right - x, height: top - bottom });
    }
  }
  return out;
}

/** Plain text of a page: runs joined by spaces, a new line wherever pdf.js saw a line break. */
export function itemsToText(items: TextItem[]): string {
  let out = '';
  for (const it of items) {
    out += it.str;
    out += it.eol ? '\n' : ' ';
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

export interface TextLine {
  items: TextItem[];
  bottom: number;
  top: number;
  rtl: boolean;
  /** a run of rotated text (reads up or down the page); its items are in reading order */
  vertical?: boolean;
}

/** Groups text runs into printed lines, top of the page first. */
export function groupLines(items: TextItem[]): TextLine[] {
  const usable = items.filter((i) => i.width > 0 && i.height > 0 && i.str.trim() && !i.vertical);
  const lines: TextLine[] = [];
  for (const item of [...usable].sort((a, b) => b.y - a.y)) {
    const [bottom, top] = band(item);
    const mid = (bottom + top) / 2;
    const line = lines.find((l) => mid > l.bottom && mid < l.top);
    if (line) {
      line.items.push(item);
      line.bottom = Math.min(line.bottom, bottom);
      line.top = Math.max(line.top, top);
    } else lines.push({ items: [item], bottom, top, rtl: false });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    // numbers and symbols say nothing about direction: decide by the runs that contain letters
    const lettered = l.items.filter((i) => /\p{L}/u.test(i.str));
    l.rtl = lettered.length > 0 && lettered.filter((i) => i.rtl).length > lettered.length / 2;
  }
  // rotated text (margin notes, spines) forms its own lines, one per column of text
  const rotated = items.filter((i) => i.width > 0 && i.height > 0 && i.str.trim() && i.vertical);
  const columns: TextItem[][] = [];
  for (const it of rotated) {
    const col = columns.find((c) => c[0].vertical === it.vertical && Math.abs(c[0].x - it.x) < it.height * 0.8);
    if (col) col.push(it);
    else columns.push([it]);
  }
  for (const col of columns) {
    col.sort((a, b) => (col[0].vertical === 'up' ? a.y - b.y : b.y - a.y));
    const ys = col.flatMap((i) => [i.y, i.y + i.width]);
    lines.push({ items: col, bottom: Math.min(...ys), top: Math.max(...ys), rtl: col.some((i) => i.rtl), vertical: true });
  }
  return lines.sort((a, b) => b.top - a.top);
}

/**
 * Selects text the way a PDF reader does: from where the drag starts to where it ends, following the reading
 * order (line by line, right to left on Arabic lines), not whatever sits inside a box.
 * Returns [] when the drag is nowhere near any text, e.g. on a page that is only a picture.
 */
export function selectTextFlow(items: TextItem[], a: [number, number], b: [number, number]): Rect[] {
  const lines = groupLines(items).filter((l) => !l.vertical);
  if (lines.length === 0) return [];
  const [first, last] = a[1] >= b[1] ? [a, b] : [b, a]; // first = higher on the page
  const near = (y: number) => {
    let best = -1;
    let dist = Infinity;
    lines.forEach((l, i) => {
      const d = y > l.bottom && y < l.top ? 0 : Math.min(Math.abs(y - l.top), Math.abs(y - l.bottom));
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    const h = lines[best].top - lines[best].bottom;
    return dist <= h * 1.5 ? best : -1;
  };
  let from = near(first[1]);
  let to = near(last[1]);
  if (from === -1 && to === -1) {
    // a tall drag that starts and ends outside text can still sweep across lines
    const swept = lines.map((l, i) => (l.top > last[1] && l.bottom < first[1] ? i : -1)).filter((i) => i >= 0);
    if (swept.length === 0) return [];
    from = swept[0];
    to = swept[swept.length - 1];
  }
  if (from === -1) from = to;
  if (to === -1) to = from;
  const out: Rect[] = [];
  for (let i = from; i <= to; i++) {
    const line = lines[i];
    let x0 = -Infinity;
    let x1 = Infinity;
    if (from === to) {
      x0 = Math.min(a[0], b[0]);
      x1 = Math.max(a[0], b[0]);
    } else if (i === from) {
      if (line.rtl) x1 = first[0];
      else x0 = first[0];
    } else if (i === to) {
      if (line.rtl) x0 = last[0];
      else x1 = last[0];
    }
    for (const item of line.items) {
      const l = Math.max(item.x, x0);
      const r = Math.min(item.x + item.width, x1);
      if (r - l < 1) continue;
      out.push({ x: l, y: line.bottom, width: r - l, height: line.top - line.bottom });
    }
  }
  return mergeLineRects(out);
}

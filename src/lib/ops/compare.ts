import { diffArrays, diffWordsWithSpace } from 'diff';
import { createCanvas, type CanvasLike, type PdfPreview } from '../pdf';
import { itemsToText } from './textselect';

export interface Segment {
  type: 'same' | 'added' | 'removed';
  text: string;
}

export interface PageTextDiff {
  /** 0-based page numbers in the old / new file (-1 when that file has no such page) */
  oldPage: number;
  newPage: number;
  segments: Segment[];
  added: number;
  removed: number;
}

/** Word-level difference between two texts. */
export function diffText(a: string, b: string): { segments: Segment[]; added: number; removed: number } {
  const segments: Segment[] = [];
  let added = 0;
  let removed = 0;
  for (const part of diffWordsWithSpace(a, b)) {
    const type = part.added ? 'added' : part.removed ? 'removed' : 'same';
    if (type === 'added') added += part.value.split(/\s+/).filter(Boolean).length;
    if (type === 'removed') removed += part.value.split(/\s+/).filter(Boolean).length;
    segments.push({ type, text: part.value });
  }
  return { segments, added, removed };
}

/**
 * Pairs pages: pages are matched by text similarity first (so an inserted page does not shift every
 * later comparison), then compared word by word. Unmatched pages count as fully added or removed.
 */
export function pairPages(oldTexts: string[], newTexts: string[]): [number, number][] {
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
  const a = oldTexts.map(norm);
  const b = newTexts.map(norm);
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  for (const part of diffArrays(a, b)) {
    const n = part.count ?? 0;
    if (part.added) for (let k = 0; k < n; k++) pairs.push([-1, j++]);
    else if (part.removed) for (let k = 0; k < n; k++) pairs.push([i++, -1]);
    else for (let k = 0; k < n; k++) pairs.push([i++, j++]);
  }
  // an unmatched old page right before an unmatched new page is most likely the same page, edited
  const merged: [number, number][] = [];
  for (let k = 0; k < pairs.length; k++) {
    const p = pairs[k];
    const next = pairs[k + 1];
    if (p[1] === -1 && next && next[0] === -1) {
      merged.push([p[0], next[1]]);
      k += 1;
    } else if (p[0] === -1 && next && next[1] === -1) {
      merged.push([next[0], p[1]]);
      k += 1;
    } else merged.push(p);
  }
  return merged;
}

export async function pageTexts(preview: PdfPreview): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < preview.numPages; i++) out.push(itemsToText(await preview.textItems(i)));
  return out;
}

export async function compareText(oldPreview: PdfPreview, newPreview: PdfPreview): Promise<PageTextDiff[]> {
  const [oldTexts, newTexts] = await Promise.all([pageTexts(oldPreview), pageTexts(newPreview)]);
  return pairPages(oldTexts, newTexts).map(([o, n]) => {
    const d = diffText(o >= 0 ? oldTexts[o] : '', n >= 0 ? newTexts[n] : '');
    return { oldPage: o, newPage: n, ...d };
  });
}

export interface VisualDiff {
  /** share of pixels that differ noticeably, 0..1 */
  ratio: number;
  /** the new page with changed areas tinted red and unchanged areas faded */
  canvas: CanvasLike;
}

interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Compares two rendered pages pixel by pixel. `b` is drawn at `a`'s size when the sizes differ. */
export function visualDiff(a: CanvasLike, b: CanvasLike, tolerance = 40): VisualDiff {
  const width = a.width;
  const height = a.height;
  const read = (c: CanvasLike): Pixels => {
    let src = c;
    if (c.width !== width || c.height !== height) {
      src = createCanvas(width, height);
      const ctx = src.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(c, 0, 0, width, height);
    }
    return { data: src.getContext('2d').getImageData(0, 0, width, height).data, width, height };
  };
  const pa = read(a);
  const pb = read(b);
  const out = createCanvas(width, height);
  const octx = out.getContext('2d');
  const img = octx.createImageData(width, height);
  let changed = 0;
  for (let p = 0; p < pa.data.length; p += 4) {
    const delta = Math.abs(pa.data[p] - pb.data[p]) + Math.abs(pa.data[p + 1] - pb.data[p + 1]) + Math.abs(pa.data[p + 2] - pb.data[p + 2]);
    if (delta > tolerance) {
      changed += 1;
      img.data[p] = 220;
      img.data[p + 1] = 38;
      img.data[p + 2] = 38;
      img.data[p + 3] = 255;
    } else {
      // unchanged: the new page, faded, so the changes stand out
      const gray = (pb.data[p] + pb.data[p + 1] + pb.data[p + 2]) / 3;
      const faded = 255 - (255 - gray) * 0.45;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = faded;
      img.data[p + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return { ratio: changed / (width * height), canvas: out };
}

/** Renders one page of each file at the same pixel size and compares them. */
export async function comparePageVisually(oldPreview: PdfPreview, oldPage: number, newPreview: PdfPreview, newPage: number, width = 900): Promise<VisualDiff> {
  const sizeOld = await oldPreview.pageSize(oldPage);
  const sizeNew = await newPreview.pageSize(newPage);
  const a = createCanvas(1, 1);
  const b = createCanvas(1, 1);
  await oldPreview.renderToCanvas(oldPage, a, width / sizeOld.width);
  await newPreview.renderToCanvas(newPage, b, width / sizeNew.width);
  return visualDiff(a, b);
}

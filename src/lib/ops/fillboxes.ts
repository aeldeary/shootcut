import fontkit from '@cantoo/fontkit';
import { PDFDocument, type PDFPage } from 'pdf-lib';
import { embedFonts, type FontSet } from '../fonts';
import { drawLine, layoutLine, wrapText, measureLine, type Align, type BaseDir } from '../text';
import { viewAngleToUser } from './geometry';
import { hexToRgb } from './stamp';
import type { Rect } from './textselect';

/** How the text sits in its box: follows the language, or is forced right-to-left, left-to-right, or centred. */
export type BoxMode = 'auto' | 'rtl' | 'ltr' | 'center';

export interface BoxStyle {
  /** 'plain' is the built-in Latin + Arabic pair; any other id is a font file the person added */
  font: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  mode: BoxMode;
  /** points; 0 = fit the box */
  size: number;
}

export const DEFAULT_BOX_STYLE: BoxStyle = { font: 'plain', bold: false, italic: false, underline: false, color: '#111111', mode: 'auto', size: 0 };

export interface TextBox {
  page: number;
  /** PDF user space */
  rect: Rect;
  text: string;
  multiline: boolean;
  style: BoxStyle;
}

export const baseOf = (m: BoxMode): BaseDir => (m === 'rtl' ? 'rtl' : m === 'ltr' ? 'ltr' : 'auto');
export const alignOf = (m: BoxMode): Align => (m === 'rtl' ? 'right' : m === 'ltr' ? 'left' : m === 'center' ? 'center' : 'start');

/** The font size used when the person has not chosen one: roughly two thirds of the box height. */
export const autoSize = (height: number): number => Math.max(6, Math.min(16, height * 0.66));

/**
 * The box as seen in the viewer: its lower-left corner in page space and its width and height as read, so text can be
 * drawn upright on a rotated page. `angle` is the rotation to draw with (degrees, counter-clockwise).
 */
export function viewFrame(rect: Rect, angle: number): { x: number; y: number; width: number; height: number } {
  const a = (angle * Math.PI) / 180;
  const ex = [Math.round(Math.cos(a)), Math.round(Math.sin(a))];
  const ey = [-ex[1], ex[0]];
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height],
  ];
  const px = (c: number[]) => c[0] * ex[0] + c[1] * ex[1];
  const py = (c: number[]) => c[0] * ey[0] + c[1] * ey[1];
  const minX = Math.min(...corners.map(px));
  const maxX = Math.max(...corners.map(px));
  const minY = Math.min(...corners.map(py));
  const maxY = Math.max(...corners.map(py));
  const origin = corners.find((c) => px(c) === minX && py(c) === minY) ?? corners[0];
  return { x: origin[0], y: origin[1], width: maxX - minX, height: maxY - minY };
}

type Loaded = Map<string, FontSet>;

async function fontsFor(doc: PDFDocument, style: BoxStyle, files: Record<string, Uint8Array>, cache: Loaded): Promise<{ fonts: FontSet; fakeBold: boolean }> {
  const custom = style.font !== 'plain' ? files[style.font] : undefined;
  if (!custom) return { fonts: await embedFonts(doc, style.bold ? 'bold' : 'regular'), fakeBold: false };
  let set = cache.get(style.font);
  if (!set) {
    doc.registerFontkit(fontkit);
    const f = await doc.embedFont(custom, { subset: true });
    set = { latin: f, arabic: f };
    cache.set(style.font, set);
  }
  return { fonts: set, fakeBold: style.bold };
}

/** Writes each box's text onto its page, inside the box, in the chosen font, colour and direction. */
export async function writeBoxes(bytes: Uint8Array, boxes: TextBox[], files: Record<string, Uint8Array> = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const cache: Loaded = new Map();
  for (const b of boxes) {
    if (!b.text.trim()) continue;
    const page: PDFPage = doc.getPage(b.page);
    const angle = viewAngleToUser(page, 0);
    const fr = viewFrame(b.rect, angle);
    const s = b.style;
    const { fonts, fakeBold } = await fontsFor(doc, s, files, cache);
    const base = baseOf(s.mode);
    const align = alignOf(s.mode);
    const pad = 2;
    const room = Math.max(1, fr.width - pad * 2);
    const rad = (angle * Math.PI) / 180;
    const cos = Math.round(Math.cos(rad));
    const sin = Math.round(Math.sin(rad));
    // a point inside the box, given as (across, up) in the viewer's frame
    const at = (u: number, v: number): [number, number] => [fr.x + u * cos - v * sin, fr.y + u * sin + v * cos];
    const draw = (text: string, size: number, v: number, lineRtl: boolean) => {
      const toRight = align === 'right' || (align === 'start' && lineRtl);
      const u = align === 'center' ? fr.width / 2 : toRight ? fr.width - pad : pad;
      const [x, y] = at(u, v);
      drawLine(page, text, {
        x,
        y,
        size,
        fonts,
        color: hexToRgb(s.color),
        rotate: angle,
        align: align === 'center' ? 'center' : toRight ? 'right' : 'left',
        base,
        italic: s.italic,
        embolden: fakeBold,
        underline: s.underline,
      });
    };

    if (b.multiline) {
      const size = s.size || Math.min(12, autoSize(Math.min(fr.height, 22)));
      const lh = size * 1.3;
      const lines = wrapText(b.text, fonts, size, room, base);
      lines.forEach((ln, i) => {
        if (!ln) return;
        const v = fr.height - pad - size * 0.85 - i * lh;
        if (v < -size) return;
        draw(ln, size, v, layoutLine(ln, fonts, size, base).rtl);
      });
    } else {
      let size = s.size || autoSize(fr.height);
      const text = b.text.replace(/\s*\n\s*/g, ' ');
      if (!s.size) while (size > 6 && measureLine(text, fonts, size, base) > room) size -= 0.5;
      const v = (fr.height - size) / 2 + size * 0.2;
      draw(text, size, v, layoutLine(text, fonts, size, base).rtl);
    }
  }
  return doc.save();
}

/**
 * The order Tab visits boxes in: page by page, row by row from the top, and inside a row from the left
 * (or from the right for right-to-left forms). Boxes whose centres are close in height count as one row.
 */
export function readingOrder<T extends { page: number; rect: Rect }>(items: T[], rtl = false): T[] {
  const out: T[] = [];
  const pages = [...new Set(items.map((i) => i.page))].sort((a, b) => a - b);
  for (const p of pages) {
    const onPage = items.filter((i) => i.page === p).sort((a, b) => b.rect.y + b.rect.height / 2 - (a.rect.y + a.rect.height / 2));
    const rows: T[][] = [];
    for (const it of onPage) {
      const c = it.rect.y + it.rect.height / 2;
      const row = rows.find((r) => {
        const rc = r[0].rect.y + r[0].rect.height / 2;
        return Math.abs(rc - c) < Math.min(r[0].rect.height, it.rect.height) * 0.6;
      });
      if (row) row.push(it);
      else rows.push([it]);
    }
    for (const r of rows) out.push(...r.sort((a, b) => (rtl ? b.rect.x - a.rect.x : a.rect.x - b.rect.x)));
  }
  return out;
}

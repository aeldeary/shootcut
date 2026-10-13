import bidiFactory from 'bidi-js';
import { degrees, rgb, type Color, type PDFFont, type PDFPage } from 'pdf-lib';
import type { FontSet } from './fonts';

/**
 * Text layout for PDF pages that handles Arabic (joining + right-to-left) mixed with
 * Latin text and numbers. pdf-lib draws glyphs left to right and knows nothing about
 * bidirectional text, so we run the Unicode bidi algorithm ourselves and draw the text
 * as a sequence of single-direction chunks in visual order. Joining/shaping of Arabic
 * letters inside a chunk is done by fontkit.
 */

const bidi = bidiFactory();

// Bidi control characters are used for layout only and must never be drawn.
const BIDI_CONTROL_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

/**
 * A number with separators ("2026-10-10", "12:30", "1,250.50") is meant to read left to right as typed.
 * After an Arabic word the Unicode algorithm would flip its parts, so we isolate such tokens.
 */
function isolateNumbers(text: string): string {
  return text.replace(/\d+(?:[-\/.:,\u066B\u066C]\d+)+/g, (m) => `\u2066${m}\u2069`);
}

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿‌‍]/;

export type BaseDir = 'auto' | 'ltr' | 'rtl';

export interface Chunk {
  text: string;
  font: PDFFont;
  width: number;
}

export interface Line {
  /** chunks in visual (left-to-right) order */
  chunks: Chunk[];
  width: number;
  /** true when the paragraph direction is right-to-left */
  rtl: boolean;
}

export function hasArabic(text: string): boolean {
  return ARABIC_RE.test(text);
}

function pickFont(ch: string, fonts: FontSet): PDFFont {
  return ARABIC_RE.test(ch) ? fonts.arabic : fonts.latin;
}

/** Splits `text` into runs that need the same font, keeping order. */
function splitByFont(text: string, fonts: FontSet): { text: string; font: PDFFont }[] {
  const out: { text: string; font: PDFFont }[] = [];
  for (const ch of text) {
    const font = pickFont(ch, fonts);
    const last = out[out.length - 1];
    if (last && last.font === font) last.text += ch;
    else out.push({ text: ch, font });
  }
  return out;
}

/** Lays out one line (no wrapping). */
export function layoutLine(input: string, fonts: FontSet, size: number, base: BaseDir = 'auto'): Line {
  if (!input) return { chunks: [], width: 0, rtl: base === 'rtl' };
  const text = isolateNumbers(input);

  const result = bidi.getEmbeddingLevels(text, base);
  const levels = result.levels;
  const rtl = (result.paragraphs[0]?.level ?? 0) % 2 === 1;
  const order = bidi.getReorderedIndices(text, result);
  const mirrored = bidi.getMirroredCharactersMap(text, levels);

  // Group the visual order into runs of one direction whose indices are contiguous.
  const groups: { indices: number[]; rtl: boolean }[] = [];
  for (const idx of order) {
    const isRtl = (levels[idx] & 1) === 1;
    const g = groups[groups.length - 1];
    if (g && g.rtl === isRtl) {
      const prev = g.indices[g.indices.length - 1];
      if (idx === prev + (isRtl ? -1 : 1)) {
        g.indices.push(idx);
        continue;
      }
    }
    groups.push({ indices: [idx], rtl: isRtl });
  }

  const chunks: Chunk[] = [];
  for (const g of groups) {
    const logical = g.rtl ? g.indices.slice().reverse() : g.indices;
    const str = logical
      .filter((i) => !BIDI_CONTROL_RE.test(text[i]))
      .map((i) => mirrored.get(i) ?? text[i])
      .join('');
    if (!str) continue;
    const parts = splitByFont(str, fonts);
    // inside a right-to-left group the logically-first part sits furthest right
    const visual = g.rtl ? parts.reverse() : parts;
    for (const p of visual) {
      // Arabic parts are reversed by fontkit while shaping; everything else (spaces,
      // punctuation) is drawn left to right, so its characters must be put in visual order here.
      const drawn = g.rtl && p.font === fonts.latin ? Array.from(p.text).reverse().join('') : p.text;
      chunks.push({ text: drawn, font: p.font, width: p.font.widthOfTextAtSize(drawn, size) });
    }
  }
  return { chunks, width: chunks.reduce((n, c) => n + c.width, 0), rtl };
}

export function measureLine(text: string, fonts: FontSet, size: number, base: BaseDir = 'auto'): number {
  return layoutLine(text, fonts, size, base).width;
}

export type Align = 'left' | 'center' | 'right' | 'start';

export interface DrawLineOptions {
  x: number;
  y: number;
  size: number;
  fonts: FontSet;
  color?: Color;
  opacity?: number;
  /** degrees, counter-clockwise, around (x, y) */
  rotate?: number;
  /** how `x` relates to the text: its left edge, centre, right edge, or the start edge for the paragraph direction */
  align?: Align;
  base?: BaseDir;
  /** slanted letters */
  italic?: boolean;
  /** thicker strokes, for a font that has no bold file: the text is drawn twice, a hair apart */
  embolden?: boolean;
  underline?: boolean;
}

/** Draws one line of text and returns its width. */
export function drawLine(page: PDFPage, text: string, o: DrawLineOptions): number {
  const line = layoutLine(text, o.fonts, o.size, o.base ?? 'auto');
  const align: Align = o.align ?? 'left';
  const shift =
    align === 'center' ? -line.width / 2 : align === 'right' || (align === 'start' && line.rtl) ? -line.width : 0;
  const angle = ((o.rotate ?? 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let offset = shift;
  for (const c of line.chunks) {
    if (c.text.trim() !== '') {
      page.drawText(c.text, {
        x: o.x + offset * cos,
        y: o.y + offset * sin,
        size: o.size,
        font: c.font,
        color: o.color ?? rgb(0, 0, 0),
        opacity: o.opacity,
        rotate: o.rotate ? degrees(o.rotate) : undefined,
        ySkew: o.italic ? degrees(12) : undefined,
      });
      if (o.embolden) {
        const d = o.size * 0.025 + offset;
        page.drawText(c.text, {
          x: o.x + d * cos,
          y: o.y + d * sin,
          size: o.size,
          font: c.font,
          color: o.color ?? rgb(0, 0, 0),
          opacity: o.opacity,
          rotate: o.rotate ? degrees(o.rotate) : undefined,
          ySkew: o.italic ? degrees(12) : undefined,
        });
      }
    }
    offset += c.width;
  }
  if (o.underline && line.width > 0) {
    const drop = o.size * 0.14;
    const x0 = shift;
    const x1 = shift + line.width;
    page.drawLine({
      start: { x: o.x + x0 * cos + drop * sin, y: o.y + x0 * sin - drop * cos },
      end: { x: o.x + x1 * cos + drop * sin, y: o.y + x1 * sin - drop * cos },
      thickness: Math.max(0.5, o.size / 18),
      color: o.color ?? rgb(0, 0, 0),
      opacity: o.opacity,
    });
  }
  return line.width;
}

/** Greedy word wrap. Returns logical lines; each is later laid out with its own direction. */
export function wrapText(text: string, fonts: FontSet, size: number, maxWidth: number, base: BaseDir = 'auto'): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureLine(candidate, fonts, size, base) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (measureLine(word, fonts, size, base) <= maxWidth) {
        current = word;
        continue;
      }
      // a single word wider than the line: break it by characters
      current = '';
      for (const ch of word) {
        const next = current + ch;
        if (current && measureLine(next, fonts, size, base) > maxWidth) {
          lines.push(current);
          current = ch;
        } else current = next;
      }
    }
    lines.push(current);
  }
  return lines;
}

export interface ParagraphOptions {
  /** left edge of the text box */
  x: number;
  /** baseline of the first line */
  y: number;
  width: number;
  size: number;
  fonts: FontSet;
  color?: Color;
  lineHeight?: number;
  align?: 'auto' | 'left' | 'right' | 'center';
  base?: BaseDir;
}

/** Draws wrapped text starting at `y` and moving down; returns the number of lines drawn. */
export function drawParagraph(page: PDFPage, text: string, o: ParagraphOptions): number {
  const lines = wrapText(text, o.fonts, o.size, o.width, o.base ?? 'auto');
  const lh = o.lineHeight ?? o.size * 1.4;
  lines.forEach((ln, i) => {
    if (!ln) return;
    const l = layoutLine(ln, o.fonts, o.size, o.base ?? 'auto');
    const align = o.align ?? 'auto';
    const toRight = align === 'right' || (align === 'auto' && l.rtl);
    const x = align === 'center' ? o.x + o.width / 2 : toRight ? o.x + o.width : o.x;
    drawLine(page, ln, {
      x,
      y: o.y - i * lh,
      size: o.size,
      fonts: o.fonts,
      color: o.color,
      base: o.base,
      align: align === 'center' ? 'center' : toRight ? 'right' : 'left',
    });
  });
  return lines.length;
}

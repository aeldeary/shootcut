/** A light slide deck: a few layouts, a few themes, drawn the same way for the preview, the images, the PDF and the presentation. */
export type Layout = 'title' | 'bullets' | 'text' | 'image';

export interface Slide {
  id: string;
  layout: Layout;
  title: string;
  /** the second text: subtitle, bullet lines (one per line) or a paragraph */
  body: string;
  /** a picture as a data URL (PNG or JPEG) for the "image" layout */
  image: string | null;
}

export interface Theme {
  id: string;
  bg: string;
  fg: string;
  accent: string;
  muted: string;
}

export const THEMES: Theme[] = [
  { id: 'clean', bg: '#ffffff', fg: '#010101', accent: '#d71920', muted: '#58595b' },
  { id: 'night', bg: '#111112', fg: '#f2f2f3', accent: '#e53a41', muted: '#a8a9ac' },
  { id: 'sand', bg: '#faf3e6', fg: '#3b2f1e', accent: '#b45309', muted: '#7a6a52' },
  { id: 'ink', bg: '#111827', fg: '#f9fafb', accent: '#f59e0b', muted: '#9ca3af' },
  { id: 'rose', bg: '#fff1f2', fg: '#4c0519', accent: '#be123c', muted: '#7f4b57' },
];

export const W = 1280;
export const H = 720;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const LAYOUTS: Layout[] = ['title', 'bullets', 'text', 'image'];

/** Where the pieces sit, in slide pixels (1280×720). */
export function layoutBoxes(layout: Layout): { title: Box; body: Box; image: Box | null } {
  const m = 80;
  switch (layout) {
    case 'title':
      return { title: { x: m, y: 220, w: W - 2 * m, h: 150 }, body: { x: m, y: 400, w: W - 2 * m, h: 160 }, image: null };
    case 'image':
      return { title: { x: m, y: 56, w: W - 2 * m, h: 110 }, body: { x: m, y: 520, w: W - 2 * m, h: 150 }, image: { x: m, y: 180, w: W - 2 * m, h: 320 } };
    default:
      return { title: { x: m, y: 56, w: W - 2 * m, h: 130 }, body: { x: m, y: 210, w: W - 2 * m, h: 450 }, image: null };
  }
}

export const isRtlText = (s: string): boolean => /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(s);
/** A slide is laid out right to left when its text is Arabic (or Hebrew). */
export const slideIsRtl = (s: Slide): boolean => isRtlText(`${s.title} ${s.body}`);

/** The body as separate lines, without typed bullet marks. */
export function bodyLines(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*••]\s*/, '').trim())
    .filter((l) => l !== '');
}

/** Breaks text into lines no wider than `maxW`, using a caller-supplied width measure. A word wider than a line is cut. */
export function wrapText(measure: (s: string) => number, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (measure(next) <= maxW) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      line = w;
      while (measure(line) > maxW && line.length > 1) {
        let k = line.length - 1;
        while (k > 1 && measure(line.slice(0, k)) > maxW) k--;
        out.push(line.slice(0, k));
        line = line.slice(k);
      }
    }
    out.push(line);
  }
  return out;
}

let counter = 0;
export const newId = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`;

export const blankSlide = (layout: Layout = 'bullets'): Slide => ({ id: newId(), layout, title: '', body: '', image: null });

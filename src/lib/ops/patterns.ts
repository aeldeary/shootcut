import type { TextItem } from '../pdf';
import type { Rect } from './textselect';

/** Kinds of private data that can be found by their shape. */
export type PatternKind = 'email' | 'phone' | 'card' | 'idNumber' | 'date' | 'link';

export const PATTERN_KINDS: PatternKind[] = ['email', 'phone', 'card', 'idNumber', 'date', 'link'];

/** Arabic-Indic and Persian digits become 0-9, one for one, so positions in the text stay the same. */
export function westernDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0));
}

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const countDigits = (s: string) => s.replace(/\D/g, '').length;

interface Def {
  re: RegExp;
  ok?: (m: string) => boolean;
}

const DEFS: Record<PatternKind, Def> = {
  email: { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g },
  // +965 1234 5678, 00965-12345678, (02) 555-1234 ... between 8 and 15 digits
  phone: { re: /(?:\+|00)?\d(?:[\s().-]?\d){7,14}/g, ok: (m) => countDigits(m) >= 8 && countDigits(m) <= 15 },
  card: { re: /\d(?:[ -]?\d){12,18}/g, ok: (m) => countDigits(m) >= 13 && luhn(m.replace(/\D/g, '')) },
  // national and civil ID numbers: 9 to 14 digits in a row (the Kuwaiti civil ID has 12)
  idNumber: { re: /(?<!\d)\d{9,14}(?!\d)/g },
  date: { re: /(?<!\d)\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}(?!\d)/g },
  link: { re: /(?:https?:\/\/|www\.)[^\s<>"')]+/gi },
};

/** Every place in `text` that looks like `kind`: [start, end) pairs. */
export function findPattern(text: string, kind: PatternKind): [number, number][] {
  const { re, ok } = DEFS[kind];
  const hay = westernDigits(text);
  const out: [number, number][] = [];
  for (const m of hay.matchAll(new RegExp(re.source, re.flags))) {
    if (m.index === undefined || (ok && !ok(m[0]))) continue;
    out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

/** Joins ranges that touch or overlap, so one piece of text gets one box. */
export function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [from, to] of sorted) {
    const last = out[out.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

/**
 * Boxes over every match of the chosen kinds. Letter widths are estimated (the page gives only the width of the whole
 * run), so each box is a little wider than the match: covering a neighbouring character is better than leaving one digit
 * of a number uncovered. A number split over two text runs on the page is not found.
 */
export function findPatternBoxes(items: TextItem[], kinds: PatternKind[]): Rect[] {
  const out: Rect[] = [];
  for (const item of items) {
    const n = item.str.length;
    if (!n || item.width <= 0 || item.vertical) continue;
    const perChar = item.width / n;
    const found: [number, number][] = [];
    for (const kind of kinds) found.push(...findPattern(item.str, kind));
    for (const [from, to] of mergeRanges(found)) {
      const startChar = item.rtl ? n - to : from;
      const pad = perChar * 1.2;
      const x = Math.max(item.x, item.x + startChar * perChar - pad);
      const right = Math.min(item.x + item.width, item.x + (startChar + (to - from)) * perChar + pad);
      out.push({ x, y: item.y - item.height * 0.22, width: right - x, height: item.height });
    }
  }
  return out;
}

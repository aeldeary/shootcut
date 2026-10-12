// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { findPattern, findPatternBoxes, westernDigits } from './patterns';
import type { TextItem } from '../pdf';

const hit = (text: string, kind: Parameters<typeof findPattern>[1]) => findPattern(text, kind).map(([a, b]) => text.slice(a, b));

describe('patterns', () => {
  it('finds emails and links', () => {
    expect(hit('write to ahmed.d+x@mail.example.com or sara@x.kw.', 'email')).toEqual(['ahmed.d+x@mail.example.com', 'sara@x.kw']);
    expect(hit('see https://example.com/a?b=1, and www.site.kw/page)', 'link')).toEqual(['https://example.com/a?b=1,', 'www.site.kw/page']);
  });

  it('finds phone numbers, also written with Arabic-Indic digits', () => {
    expect(hit('call +965 1234 5678 now', 'phone')).toEqual(['+965 1234 5678']);
    expect(hit('اتصل على ٩٦٥١٢٣٤٥٦٧٨ الآن', 'phone')).toEqual(['٩٦٥١٢٣٤٥٦٧٨']);
    expect(hit('page 12 of 340', 'phone')).toEqual([]);
  });

  it('accepts a card number only when its check digit is right', () => {
    expect(hit('card 4111 1111 1111 1111 ok', 'card')).toEqual(['4111 1111 1111 1111']);
    expect(hit('card 4111 1111 1111 1112 no', 'card')).toEqual([]);
  });

  it('finds ID numbers and dates', () => {
    expect(hit('civil id 289010100123 here', 'idNumber')).toEqual(['289010100123']);
    expect(hit('on 12/10/2026 and 2026-10-12 and 1.5', 'date')).toEqual(['12/10/2026', '2026-10-12']);
  });

  it('converts digits one for one', () => {
    expect(westernDigits('٠١٢٣٤٥٦٧٨٩ ۰۱۲')).toBe('0123456789 012');
  });

  it('gives a box only around the match, and one box when two kinds match the same text', () => {
    const item: TextItem = { str: 'id 289010100123 end', x: 100, y: 50, width: 190, height: 10, rtl: false, vertical: false, eol: false } as TextItem;
    const boxes = findPatternBoxes([item], ['idNumber', 'phone']);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].x).toBeLessThanOrEqual(126.5 - 5); // wider than the match on purpose
    expect(boxes[0].x).toBeGreaterThan(115);
    expect(boxes[0].x + boxes[0].width).toBeGreaterThanOrEqual(253.5);
    expect(boxes[0].x + boxes[0].width).toBeLessThan(270);
  });
});

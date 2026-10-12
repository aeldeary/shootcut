// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { blankSlide, bodyLines, isRtlText, layoutBoxes, slideIsRtl, wrapText, W, H } from './model';

const width = (s: string) => s.length * 10;

describe('wrapText', () => {
  it('breaks at spaces', () => expect(wrapText(width, 'aaa bbb ccc ddd', 80)).toEqual(['aaa bbb', 'ccc ddd']));
  it('keeps blank lines and short text', () => expect(wrapText(width, 'hi\n\nthere', 200)).toEqual(['hi', '', 'there']));
  it('cuts a word that is wider than a line', () => {
    const lines = wrapText(width, 'abcdefghijklmnopqrstuvwxyz', 100);
    expect(lines.every((l) => width(l) <= 100)).toBe(true);
    expect(lines.join('')).toBe('abcdefghijklmnopqrstuvwxyz');
  });
});

describe('slide text', () => {
  it('lists lines without typed bullet marks and blanks', () => {
    expect(bodyLines('- one\n• two\n\n * three\nfour')).toEqual(['one', 'two', 'three', 'four']);
  });
  it('detects Arabic', () => {
    expect(isRtlText('hello')).toBe(false);
    expect(isRtlText('مرحبا')).toBe(true);
    expect(slideIsRtl({ ...blankSlide(), title: 'Q3 خطة' })).toBe(true);
  });
  it('keeps every box inside the slide', () => {
    for (const l of ['title', 'bullets', 'text', 'image'] as const) {
      const b = layoutBoxes(l);
      for (const box of [b.title, b.body, b.image].filter(Boolean)) {
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.w).toBeLessThanOrEqual(W);
        expect(box!.y + box!.h).toBeLessThanOrEqual(H);
      }
    }
  });
  it('gives each slide its own id', () => expect(blankSlide().id).not.toBe(blankSlide().id));
});

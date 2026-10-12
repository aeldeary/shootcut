// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dropOrphanLines, isReliablePosterWord, isUsableWord, mergeWords, wordsToText, type OcrWord } from './ocr';

const w = (text: string, x0: number, y0: number, x1: number, y1: number, confidence = 90): OcrWord => ({ text, x0, y0, x1, y1, confidence, line: '1' });

describe('OCR word cleanup', () => {
  it('drops specks and unsure words but keeps real ones', () => {
    expect(isUsableWord(w('Hello', 0, 0, 10, 10, 80), 60)).toBe(true);
    expect(isUsableWord(w('Hello', 0, 0, 10, 10, 40), 60)).toBe(false);
    expect(isUsableWord(w('7', 0, 0, 10, 10, 75), 60)).toBe(false); // lone digit on a photo
    expect(isUsableWord(w('7', 0, 0, 10, 10, 95), 60)).toBe(true);
    expect(isUsableWord(w('ا', 0, 0, 10, 10, 80), 60)).toBe(false);
    expect(isUsableWord(w('=', 0, 0, 10, 10, 95), 60)).toBe(false);
    expect(isUsableWord(w('|', 0, 0, 10, 10, 95), 60)).toBe(true);
    expect(isUsableWord(w('20', 0, 0, 10, 10, 90), 60)).toBe(true);
    expect(isUsableWord(w('20', 0, 0, 10, 10, 70), 60)).toBe(false); // short tokens need to be clear
  });

  it('keeps the most trusted reading when a word was found at several sizes', () => {
    const merged = mergeWords([w('لمتضررين', 100, 100, 300, 160, 70), w('المتضررين', 98, 98, 305, 162, 88), w('اليمن', 400, 400, 500, 450, 80)]);
    expect(merged.map((x) => x.text).sort()).toEqual(['المتضررين', 'اليمن'].sort());
  });

  it('builds lines top to bottom and reads Arabic lines right to left', () => {
    const words = [
      w('world', 120, 100, 200, 130),
      w('Hello', 10, 102, 100, 128),
      w('بكم', 10, 300, 100, 330),
      w('مرحبا', 120, 302, 220, 332),
      w('Second', 10, 200, 100, 230),
    ];
    expect(wordsToText(words)).toBe('Hello world\nSecond\nمرحبا بكم');
  });
});

describe('line direction', () => {
  it('reads an Arabic line right to left even when most of its tokens are numbers', () => {
    const words = [w('تاريخ:', 800, 100, 900, 120), w('15', 740, 100, 780, 120), w('/', 720, 100, 730, 120), w('2026', 600, 100, 700, 120), w('إلى:', 500, 100, 560, 120)];
    expect(wordsToText(words)).toBe('تاريخ: 15 / 2026 إلى:');
  });
});

describe('poster precision', () => {
  it('trusts only clear, reasonably long tokens on posters', () => {
    expect(isReliablePosterWord(w('المساهمة', 0, 0, 10, 10, 82), 72)).toBe(true);
    expect(isReliablePosterWord(w('جز', 0, 0, 10, 10, 63), 72)).toBe(false);
    expect(isReliablePosterWord(w('if', 0, 0, 10, 10, 95), 72)).toBe(false); // short Latin is grain
    expect(isReliablePosterWord(w('لا', 0, 0, 10, 10, 90), 72)).toBe(true);
    expect(isReliablePosterWord(w('-', 0, 0, 10, 10, 95), 72)).toBe(false);
    expect(isReliablePosterWord(w('7', 0, 0, 10, 10, 90), 72)).toBe(false);
    expect(isReliablePosterWord(w('20', 0, 0, 10, 10, 96), 72)).toBe(true);
    expect(isReliablePosterWord(w('الاب', 0, 0, 10, 10, 60), 72)).toBe(false);
  });

  it('drops lines that hold only a short fragment', () => {
    const kept = dropOrphanLines([w('hill', 0, 0, 40, 20, 90), w('نل', 0, 100, 40, 120, 90), w('اليمن', 0, 200, 80, 220, 90), w('20', 0, 300, 30, 320, 96)]);
    expect(kept.map((x) => x.text)).toEqual(['hill', 'اليمن', '20']);
  });
});

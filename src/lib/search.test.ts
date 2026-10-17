// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalize, rankItems, type SearchItem } from './search';

const items: SearchItem[] = [
  { id: 'merge', name: 'دمج ملفات PDF', text: 'ادمج عدة ملفات في ملف واحد Merge PDFs' },
  { id: 'compress', name: 'ضغط الصور', text: 'اجعل الصور أخف حجما Compress pictures' },
  { id: 'vid-compress', name: 'ضغط الفيديو', text: 'قلل حجم الفيديو Compress video' },
  { id: 'trim', name: 'قص الفيديو', text: 'اقتطع جزءا من الفيديو Trim video' },
];

describe('search', () => {
  it('folds Arabic spelling variants and digits', () => {
    expect(normalize('أَدْمِجْ')).toBe(normalize('ادمج'));
    expect(normalize('مدرسة')).toBe(normalize('مدرسه'));
    expect(normalize('على')).toBe(normalize('علي'));
    expect(normalize('PDF ٢٠٢٥!')).toBe('pdf 2025');
  });

  it('finds an item by a word of its name, with or without the Arabic article', () => {
    expect(rankItems('دمج', items)).toEqual(['merge']);
    expect(rankItems('الدمج', items)).toEqual(['merge']);
    expect(rankItems('الضغط', items)).toEqual(['compress', 'vid-compress']);
  });

  it('finds an item through the other language too', () => {
    expect(rankItems('compress', items)).toEqual(['compress', 'vid-compress']);
    expect(rankItems('trim', items)).toEqual(['trim']);
  });

  it('needs every word to match, and puts name matches first', () => {
    expect(rankItems('ضغط فيديو', items)).toEqual(['vid-compress']);
    // "الفيديو" is in the name of two items and only in the text of none: name matches keep the original order
    expect(rankItems('فيديو', items)).toEqual(['vid-compress', 'trim']);
    expect(rankItems('ضغط xyz', items)).toEqual([]);
  });

  it('returns nothing for an empty query', () => {
    expect(rankItems('   ', items)).toEqual([]);
    expect(rankItems('', items)).toEqual([]);
  });
});

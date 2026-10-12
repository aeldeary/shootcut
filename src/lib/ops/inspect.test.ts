// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { paperSize, samplePages } from './inspect';

describe('paperSize', () => {
  it('names A4 in either orientation', () => {
    expect(paperSize(595.28, 841.89)).toMatchObject({ name: 'A4', landscape: false });
    expect(paperSize(841.89, 595.28)).toMatchObject({ name: 'A4', landscape: true });
  });
  it('names US Letter and leaves odd sizes unnamed', () => {
    expect(paperSize(612, 792).name).toBe('Letter');
    expect(paperSize(1984, 1100).name).toBeNull();
  });
});

describe('samplePages', () => {
  it('returns every page for a short file', () => expect(samplePages(3, 6)).toEqual([0, 1, 2]));
  it('spreads over a long file, always including first and last', () => {
    const s = samplePages(100, 6);
    expect(s[0]).toBe(0);
    expect(s[s.length - 1]).toBe(99);
    expect(s.length).toBe(6);
  });
});

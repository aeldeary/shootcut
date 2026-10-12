import { describe, expect, it } from 'vitest';
import { parsePageRange } from './range';

describe('parsePageRange', () => {
  it('treats empty as all pages', () => expect(parsePageRange('', 3)).toEqual([0, 1, 2]));
  it('understands odd and even pages, alone or inside a range', () => {
    expect(parsePageRange('odd', 6)).toEqual([0, 2, 4]);
    expect(parsePageRange('even', 6)).toEqual([1, 3, 5]);
    expect(parsePageRange('even 3-8', 10)).toEqual([3, 5, 7]);
    expect(parsePageRange('فردي 1-5', 10)).toEqual([0, 2, 4]);
    expect(parsePageRange('زوجي', 5)).toEqual([1, 3]);
    expect(parsePageRange('even 1', 5)).toBeNull(); // nothing left
  });
  it('parses lists and ranges', () => expect(parsePageRange('1-2, 5', 6)).toEqual([0, 1, 4]));
  it('supports open ends', () => {
    expect(parsePageRange('4-', 6)).toEqual([3, 4, 5]);
    expect(parsePageRange('-2', 6)).toEqual([0, 1]);
  });
  it('accepts Arabic comma and removes duplicates', () => expect(parsePageRange('1،1,2', 3)).toEqual([0, 1]));
  it('rejects out-of-range and malformed input', () => {
    expect(parsePageRange('0', 3)).toBeNull();
    expect(parsePageRange('4', 3)).toBeNull();
    expect(parsePageRange('3-1', 3)).toBeNull();
    expect(parsePageRange('a', 3)).toBeNull();
    expect(parsePageRange('-', 3)).toBeNull();
  });
});

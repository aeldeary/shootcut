import { describe, expect, it } from 'vitest';
import { parsePageRange } from './range';

describe('parsePageRange', () => {
  it('treats empty as all pages', () => expect(parsePageRange('', 3)).toEqual([0, 1, 2]));
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

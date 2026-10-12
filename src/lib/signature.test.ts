import { describe, expect, it } from 'vitest';
import { contentBounds } from './signature';

describe('contentBounds', () => {
  it('finds the inked area', () => {
    const w = 10;
    const h = 8;
    const d = new Uint8ClampedArray(w * h * 4);
    for (const [x, y] of [[2, 3], [6, 5]]) d[(y * w + x) * 4 + 3] = 255;
    expect(contentBounds(d, w, h)).toEqual({ x: 2, y: 3, width: 5, height: 3 });
  });
  it('returns null for a blank image', () => {
    expect(contentBounds(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toBeNull();
  });
});

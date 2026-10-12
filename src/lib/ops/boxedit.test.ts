// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dragBox } from './boxedit';

const page = { width: 500, height: 400 };
const box = { left: 100, top: 100, width: 80, height: 40 };

describe('moving and resizing a box', () => {
  it('moves and keeps the box on the page', () => {
    expect(dragBox(box, 'move', 30, -20, page)).toEqual({ left: 130, top: 80, width: 80, height: 40 });
    expect(dragBox(box, 'move', -999, 999, page)).toEqual({ left: 0, top: 360, width: 80, height: 40 });
  });

  it('changes width and height from the edges and corners', () => {
    expect(dragBox(box, 'e', 20, 50, page)).toEqual({ left: 100, top: 100, width: 100, height: 40 });
    expect(dragBox(box, 's', 50, 25, page)).toEqual({ left: 100, top: 100, width: 80, height: 65 });
    expect(dragBox(box, 'w', -30, 0, page)).toEqual({ left: 70, top: 100, width: 110, height: 40 });
    expect(dragBox(box, 'n', 0, -10, page)).toEqual({ left: 100, top: 90, width: 80, height: 50 });
    expect(dragBox(box, 'se', 10, 10, page)).toEqual({ left: 100, top: 100, width: 90, height: 50 });
    expect(dragBox(box, 'nw', -10, -10, page)).toEqual({ left: 90, top: 90, width: 90, height: 50 });
  });

  it('never gets smaller than the minimum or bigger than the page', () => {
    const tiny = dragBox(box, 'e', -500, 0, page, 12);
    expect(tiny.width).toBe(12);
    expect(tiny.left).toBe(100);
    const flipped = dragBox(box, 'nw', 500, 500, page, 12);
    expect(flipped).toEqual({ left: 168, top: 128, width: 12, height: 12 });
    expect(dragBox(box, 'se', 999, 999, page)).toEqual({ left: 100, top: 100, width: 400, height: 300 });
  });
});

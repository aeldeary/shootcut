// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { initNodeEnv } from '../../test/node';
import { createCanvas } from '../pdf';
import { adjustCanvas, blurRegion, cropCanvas, fitToSize, fitWithin, makeTransparent, NO_ADJUST, pixelAt, pixelateRegion, resizeCanvas, rotateCanvas, watermarkCanvas, enlargedFits, sharpenCanvas, upscaleCanvas } from './imgops';

beforeAll(initNodeEnv);

function solid(w: number, h: number, color: string) {
  const c = createCanvas(w, h);
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.fillRect(0, 0, w, h);
  return c;
}

describe('imgops', () => {
  it('fitWithin never enlarges and keeps the shape', () => {
    expect(fitWithin(4000, 2000, 1000, 0)).toEqual({ width: 1000, height: 500 });
    expect(fitWithin(400, 200, 1000, 1000)).toEqual({ width: 400, height: 200 });
  });

  it('resizes and crops to the exact size', () => {
    expect(resizeCanvas(solid(400, 200, '#f00'), 100, 50)).toMatchObject({ width: 100, height: 50 });
    const c = cropCanvas(solid(100, 100, '#00f'), { x: 10, y: 20, width: 30, height: 40 });
    expect([c.width, c.height]).toEqual([30, 40]);
  });

  it('rotates by 90 degrees and swaps the sides; a mirrored corner moves', () => {
    const s = createCanvas(40, 20);
    const x = s.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 40, 20);
    x.fillStyle = '#f00';
    x.fillRect(0, 0, 10, 10); // red top-left
    const r = rotateCanvas(s, 90);
    expect([r.width, r.height]).toEqual([20, 40]);
    expect(pixelAt(r, 15, 5)[0]).toBe(255); // top-left went to top-right
    expect(pixelAt(r, 15, 5)[1]).toBe(0);
    const f = rotateCanvas(s, 0, true, false);
    expect(pixelAt(f, 35, 5)[1]).toBe(0); // mirrored to top-right
  });

  it('adjusts brightness and turns grey', () => {
    const lighter = adjustCanvas(solid(10, 10, '#808080'), { ...NO_ADJUST, brightness: 50 });
    expect(pixelAt(lighter, 5, 5)[0]).toBeGreaterThan(200);
    const grey = adjustCanvas(solid(10, 10, '#ff0000'), { ...NO_ADJUST, grayscale: 100 });
    const [r, g, b] = pixelAt(grey, 5, 5);
    expect(Math.abs(r - g)).toBeLessThan(2);
    expect(Math.abs(g - b)).toBeLessThan(2);
  });

  it('blurs and pixelates only the chosen area', () => {
    const c = createCanvas(60, 20);
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 60, 20);
    x.fillStyle = '#000';
    x.fillRect(28, 0, 4, 20); // thin black bar in the middle
    blurRegion(c, { x: 0, y: 0, width: 30, height: 20 }, 6);
    expect(pixelAt(c, 29, 10)[0]).toBeGreaterThan(30); // blurred: no longer pure black
    expect(pixelAt(c, 31, 10)[0]).toBe(0); // outside the area, untouched
    const p = createCanvas(40, 40);
    const px = p.getContext('2d');
    px.fillStyle = '#fff';
    px.fillRect(0, 0, 40, 40);
    px.fillStyle = '#000';
    px.fillRect(0, 0, 4, 4);
    pixelateRegion(p, { x: 0, y: 0, width: 40, height: 40 }, 8);
    const v = pixelAt(p, 1, 1)[0];
    expect(v).toBeGreaterThan(100); // the dark corner was averaged away
    expect(v).toBeLessThan(255);
  });

  it('makes a colour transparent and leaves the rest', () => {
    const c = createCanvas(20, 10);
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 10, 10);
    x.fillStyle = '#ff0000';
    x.fillRect(10, 0, 10, 10);
    const t = makeTransparent(c, [255, 255, 255], 10, 0);
    expect(pixelAt(t, 2, 5)[3]).toBe(0);
    expect(pixelAt(t, 15, 5)[3]).toBe(255);
  });

  it('fits to an exact size by filling or with bars', () => {
    const src = solid(200, 100, '#f00');
    const cover = fitToSize(src, 100, 100, 'cover', '#00f');
    expect(pixelAt(cover, 2, 2)[0]).toBe(255); // no bars
    const contain = fitToSize(src, 100, 100, 'contain', '#0000ff');
    expect(pixelAt(contain, 50, 2)[2]).toBe(255); // blue bar on top
    expect(pixelAt(contain, 50, 50)[0]).toBe(255);
  });

  it('puts a watermark in the corner it was asked for', () => {
    const src = solid(400, 200, '#000000');
    const out = watermarkCanvas(src, { text: 'MARK', size: 30, opacity: 1, rotation: 0, place: 'bottom-right', color: '#ffffff' });
    const quadrant = (x0: number, y0: number) => {
      let n = 0;
      for (let y = y0; y < y0 + 100; y += 2) for (let x = x0; x < x0 + 200; x += 2) if (pixelAt(out, x, y)[0] > 128) n++;
      return n;
    };
    expect(quadrant(200, 100)).toBeGreaterThan(20);
    expect(quadrant(0, 0)).toBe(0);
  });

  it('enlarges to the exact size and refuses sizes that would exhaust memory', () => {
    const big = upscaleCanvas(solid(10, 6, '#336699'), 3, 0);
    expect([big.width, big.height]).toEqual([30, 18]);
    expect(enlargedFits(4000, 3000, 2)).toBe(false); // 48 MP is too much
    expect(enlargedFits(3000, 2000, 2)).toBe(true); // 24 MP
    expect(enlargedFits(4000, 3000, 4)).toBe(false);
  });

  it('sharpening makes an edge crisper and leaves flat areas, alpha and size alone', () => {
    const c = createCanvas(8, 1);
    const x = c.getContext('2d');
    x.fillStyle = '#505050';
    x.fillRect(0, 0, 4, 1);
    x.fillStyle = '#b0b0b0';
    x.fillRect(4, 0, 4, 1);
    const s = sharpenCanvas(c, 100);
    expect([s.width, s.height]).toEqual([8, 1]);
    expect(pixelAt(s, 0, 0)[0]).toBe(0x50); // flat area unchanged
    expect(pixelAt(s, 3, 0)[0]).toBeLessThan(0x50); // darker side of the edge gets darker
    expect(pixelAt(s, 4, 0)[0]).toBeGreaterThan(0xb0); // lighter side gets lighter
    expect(pixelAt(s, 4, 0)[3]).toBe(255);
    expect(pixelAt(sharpenCanvas(c, 0), 3, 0)[0]).toBe(0x50);
  });
});

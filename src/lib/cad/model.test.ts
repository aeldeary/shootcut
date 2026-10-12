import { describe, expect, it } from 'vitest';
import { bounds, fromDxf, hit, measure, move, ortho, snap, snapToShapes, toDxf, toSvg, type Entity } from './model';

const sample = (): Entity[] => [
  { id: 'a', type: 'line', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
  { id: 'b', type: 'rect', a: { x: 10, y: 10 }, b: { x: 60, y: 40 } },
  { id: 'c', type: 'circle', c: { x: 80, y: 30 }, r: 12.5 },
  { id: 'd', type: 'poly', pts: [{ x: 0, y: 50 }, { x: 20, y: 70 }, { x: 40, y: 50 }], closed: false },
  { id: 'e', type: 'text', p: { x: 5, y: 80 }, h: 5, s: 'مرحبا Hello' },
];

describe('cad model', () => {
  it('snaps to the grid and to the horizontal or vertical line', () => {
    expect(snap({ x: 12.4, y: 7.6 }, 5)).toEqual({ x: 10, y: 10 });
    expect(snap({ x: 12.4, y: 7.6 }, 0)).toEqual({ x: 12.4, y: 7.6 });
    expect(ortho({ x: 0, y: 0 }, { x: 10, y: 3 })).toEqual({ x: 10, y: 0 });
    expect(ortho({ x: 0, y: 0 }, { x: 2, y: 9 })).toEqual({ x: 0, y: 9 });
  });

  it('snaps to ends, corners and centres within a distance', () => {
    expect(snapToShapes({ x: 59, y: 41 }, sample(), 3)).toEqual({ x: 60, y: 40 });
    expect(snapToShapes({ x: 500, y: 500 }, sample(), 3)).toBeNull();
  });

  it('measures length, area and size', () => {
    const [line, rect, circle] = sample();
    expect(measure(line).length).toBe(100);
    expect(measure(rect)).toMatchObject({ width: 50, height: 30, area: 1500, length: 160 });
    expect(measure(circle).radius).toBe(12.5);
    expect(measure(circle).area).toBeCloseTo(Math.PI * 12.5 * 12.5, 6);
  });

  it('hits a line, a circle outline and a text box; moves shapes', () => {
    const [line, , circle, , text] = sample();
    expect(hit(line, { x: 50, y: 1 }, 2)).toBe(true);
    expect(hit(line, { x: 50, y: 9 }, 2)).toBe(false);
    expect(hit(circle, { x: 80 + 12.5, y: 30 }, 1)).toBe(true);
    expect(hit(circle, { x: 80, y: 30 }, 1)).toBe(false);
    expect(hit(text, { x: 6, y: 82 }, 1)).toBe(true);
    expect(move(line, 5, -5)).toMatchObject({ a: { x: 5, y: -5 }, b: { x: 105, y: -5 } });
  });

  it('bounds cover every shape', () => {
    expect(bounds([])).toBeNull();
    const b = bounds(sample())!;
    expect(b.minX).toBe(0);
    expect(b.minY).toBe(0);
    expect(b.maxX).toBeGreaterThanOrEqual(100);
    expect(b.maxY).toBeGreaterThanOrEqual(85);
  });

  it('writes an SVG with every kind of shape and the y axis flipped', () => {
    const svg = toSvg(sample());
    for (const tag of ['<line', '<rect', '<circle', '<polyline', '<text']) expect(svg).toContain(tag);
    expect(svg).toContain('مرحبا Hello');
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('round-trips through DXF, Arabic text included', () => {
    const dxf = toDxf(sample());
    expect(dxf).toContain('AC1009');
    expect(dxf).toMatch(/\\U\+0645/); // Arabic is written as escapes so any CAD program reads it
    expect(/[^\x00-\x7e]/.test(dxf)).toBe(false);
    const back = fromDxf(dxf);
    expect(back.skipped).toBe(0);
    const types = back.entities.map((e) => e.type);
    expect(types).toEqual(['line', 'poly', 'circle', 'poly', 'text']);
    const text = back.entities.find((e) => e.type === 'text');
    expect(text && text.type === 'text' && text.s).toBe('مرحبا Hello');
    const rect = back.entities[1];
    expect(rect.type === 'poly' && rect.closed && rect.pts.length).toBe(4);
    expect(measure(rect).area).toBe(1500);
  });

  it('reads lightweight polylines, arcs and counts shapes it cannot draw', () => {
    const dxf = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'LWPOLYLINE', '90', '3', '70', '1', '10', '0', '20', '0', '10', '10', '20', '0', '10', '10', '20', '10',
      '0', 'ARC', '10', '0', '20', '0', '40', '5', '50', '0', '51', '90',
      '0', 'HATCH', '8', '0',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\n');
    const r = fromDxf(dxf);
    expect(r.entities.length).toBe(2);
    expect(r.skipped).toBe(1);
    const lw = r.entities[0];
    expect(lw.type === 'poly' && lw.closed && lw.pts.length).toBe(3);
  });
});

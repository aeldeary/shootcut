// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { initNodeEnv } from '../../test/node';
import { burnMeasurements, calibrate, defaultScale, distance, formatArea, formatLength, formatNumber, measurementLabel, perimeter, polygonArea } from './measure';

beforeAll(initNodeEnv);

describe('measure math', () => {
  it('measures distance, perimeter and area', () => {
    expect(distance([0, 0], [3, 4])).toBe(5);
    expect(perimeter([[0, 0], [10, 0], [10, 10]])).toBe(20);
    expect(perimeter([[0, 0], [10, 0], [10, 10]], true)).toBeCloseTo(34.142, 2);
    expect(polygonArea([[0, 0], [10, 0], [10, 5], [0, 5]])).toBe(50);
    // clockwise or counter-clockwise gives the same area
    expect(polygonArea([[0, 5], [10, 5], [10, 0], [0, 0]])).toBe(50);
  });

  it('uses 1/72 inch per point by default', () => {
    expect(formatLength(72, defaultScale('in'))).toBe('1 in');
    expect(formatLength(72, defaultScale('mm'))).toBe('25.4 mm');
    expect(formatLength(595.28, defaultScale('mm'))).toBe('210 mm'); // A4 width
  });

  it('calibrates against a known length and scales area by the square', () => {
    const s = calibrate(100, 5, 'm'); // 100 pt on the drawing = 5 m
    expect(formatLength(200, s)).toBe('10 m');
    expect(formatArea(100 * 100, s)).toBe('25 m²');
    expect(() => calibrate(0, 5, 'm')).toThrow();
    expect(() => calibrate(10, -1, 'm')).toThrow();
  });

  it('formats with Western digits and no trailing zeros', () => {
    expect(formatNumber(2)).toBe('2');
    expect(formatNumber(2.5)).toBe('2.5');
    expect(formatNumber(1234.567)).toBe('1234.6');
    expect(formatNumber(0.12345)).toBe('0.123');
  });

  it('labels each kind', () => {
    const s = calibrate(100, 10, 'cm');
    expect(measurementLabel({ kind: 'distance', page: 0, a: [0, 0], b: [100, 0] }, s)).toBe('10 cm');
    expect(measurementLabel({ kind: 'area', page: 0, points: [[0, 0], [100, 0], [100, 100], [0, 100]] }, s)).toBe('100 cm² · 40 cm');
  });
});

describe('burnMeasurements', () => {
  it('draws the lines and their labels into the page', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 300]);
    const out = await burnMeasurements(await doc.save(), [{ kind: 'distance', page: 0, a: [50, 150], b: [250, 150] }], calibrate(200, 20, 'cm'), '#000000');
    const dir = mkdtempSync(join(tmpdir(), 'sc-'));
    const f = join(dir, 'm.pdf');
    writeFileSync(f, out);
    expect(execFileSync('pdftotext', [f, '-']).toString()).toContain('20 cm');
    execFileSync('pdftoppm', ['-r', '72', '-png', f, join(dir, 'm')]);
    // the line sits at page y 150 -> image y 150; check a pixel on it, away from the label
    const px = (x: number, y: number) => execFileSync('convert', [join(dir, 'm-1.png'), '-format', `%[pixel:p{${x},${y}}]`, 'info:']).toString();
    expect(px(80, 150)).not.toMatch(/white|srgb\(255,255,255\)/);
    expect(px(80, 100)).toMatch(/white|srgb\(255,255,255\)/);
  });
});

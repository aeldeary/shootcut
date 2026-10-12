// @vitest-environment node
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initNodeEnv } from '../../test/node';
import { openPreview } from '../pdf';
import { compareText, comparePageVisually, diffText, pairPages, visualDiff } from './compare';

vi.mock('pdfjs-dist', async () => ({ ...(await import('pdfjs-dist/legacy/build/pdf.mjs')), GlobalWorkerOptions: {} }));
beforeAll(initNodeEnv);

describe('text comparison', () => {
  it('reports added and removed words', () => {
    const d = diffText('The total is 100 KWD', 'The total is 250 KWD today');
    expect(d.removed).toBe(1);
    expect(d.added).toBe(2);
    expect(d.segments.filter((s) => s.type === 'removed').map((s) => s.text.trim())).toEqual(['100']);
    expect(d.segments.map((s) => s.text).join('')).toContain('250');
  });

  it('finds no differences in equal text', () => {
    const d = diffText('same text', 'same text');
    expect([d.added, d.removed]).toEqual([0, 0]);
  });

  it('matches pages even when one is inserted', () => {
    expect(pairPages(['A', 'B', 'C'], ['A', 'X', 'B', 'C'])).toEqual([[0, 0], [-1, 1], [1, 2], [2, 3]]);
    expect(pairPages(['A', 'B'], ['A'])).toEqual([[0, 0], [1, -1]]);
  });

  it('treats a changed page as the same page, edited', () => {
    expect(pairPages(['A', 'B old', 'C'], ['A', 'B new', 'C'])).toEqual([[0, 0], [1, 1], [2, 2]]);
  });

  it('compares two real PDFs page by page', async () => {
    const make = async (lines: string[][]) => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      for (const page of lines) {
        const p = doc.addPage([400, 300]);
        page.forEach((l, i) => p.drawText(l, { x: 30, y: 250 - i * 24, size: 14, font }));
      }
      return doc.save();
    };
    const a = await openPreview(await make([['Invoice 1001', 'Amount 100 KWD'], ['Terms apply']]));
    const b = await openPreview(await make([['Invoice 1001', 'Amount 250 KWD'], ['Terms apply']]));
    const diffs = await compareText(a, b);
    expect(diffs).toHaveLength(2);
    expect([diffs[0].added, diffs[0].removed]).toEqual([1, 1]);
    expect([diffs[1].added, diffs[1].removed]).toEqual([0, 0]);
    a.destroy();
    b.destroy();
  });
});

describe('visual comparison', () => {
  const solid = (w: number, h: number, color: string, box?: [number, number, number, number, string]) => {
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    if (box) {
      ctx.fillStyle = box[4];
      ctx.fillRect(box[0], box[1], box[2], box[3]);
    }
    return c as never;
  };

  it('is zero for identical images and measures a changed block', () => {
    expect(visualDiff(solid(100, 100, '#ffffff'), solid(100, 100, '#ffffff')).ratio).toBe(0);
    const d = visualDiff(solid(100, 100, '#ffffff'), solid(100, 100, '#ffffff', [0, 0, 50, 20, '#000000']));
    expect(d.ratio).toBeCloseTo(0.1, 5);
    const px = d.canvas.getContext('2d').getImageData(10, 10, 1, 1).data;
    expect([px[0], px[1], px[2]]).toEqual([220, 38, 38]);
    const same = d.canvas.getContext('2d').getImageData(90, 90, 1, 1).data;
    expect(same[0]).toBe(255);
  });

  it('ignores tiny anti-aliasing noise', () => {
    expect(visualDiff(solid(50, 50, '#ffffff'), solid(50, 50, '#fafafa')).ratio).toBe(0);
  });

  it('compares real pages rendered at the same size', async () => {
    const make = async (x: number) => {
      const doc = await PDFDocument.create();
      doc.addPage([300, 200]).drawRectangle({ x, y: 50, width: 60, height: 60, color: rgb(0, 0, 0) });
      return doc.save();
    };
    const a = await openPreview(await make(20));
    const b = await openPreview(await make(200));
    const d = await comparePageVisually(a, 0, b, 0, 300);
    expect(d.ratio).toBeGreaterThan(0.1);
    expect(d.ratio).toBeLessThan(0.13);
    const same = await comparePageVisually(a, 0, a, 0, 300);
    expect(same.ratio).toBe(0);
    a.destroy();
    b.destroy();
  });
});

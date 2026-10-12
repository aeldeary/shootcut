// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { bookletOrder, bookletPdf, cellBox, nUpPdf, type NUpOptions } from './layout';

async function make(n: number) {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage([300, 400]);
  return d.save();
}
const base: NUpOptions = { cols: 2, rows: 2, sheet: 'a4', landscape: false, margin: 10, border: false, rtl: false };

describe('pages per sheet', () => {
  it('makes one sheet for every 4 pages', async () => {
    const out = await PDFDocument.load(await nUpPdf(await make(9), base));
    expect(out.getPageCount()).toBe(3);
    expect(Math.round(out.getPage(0).getWidth())).toBe(595);
  });

  it('turns the sheet sideways when asked', async () => {
    const out = await PDFDocument.load(await nUpPdf(await make(2), { ...base, cols: 2, rows: 1, landscape: true }));
    expect(Math.round(out.getPage(0).getWidth())).toBe(842);
  });

  it('puts the first page on the right for right-to-left reading', () => {
    const ltr = cellBox(0, base, 600, 800);
    const rtl = cellBox(0, { ...base, rtl: true }, 600, 800);
    expect(ltr.x).toBeLessThan(rtl.x);
    expect(ltr.y).toBe(rtl.y);
  });
});

describe('booklet', () => {
  it('orders 8 pages so that folded sheets read in order', () => {
    expect(bookletOrder(8)).toEqual([[7, 0], [1, 6], [5, 2], [3, 4]]);
  });

  it('pads with blanks up to a multiple of 4', () => {
    const o = bookletOrder(5);
    expect(o).toHaveLength(4);
    expect(o.flat().filter((x) => x !== null).sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('swaps the sides for a right-bound book', () => {
    expect(bookletOrder(4, true)).toEqual([[0, 3], [2, 1]]);
  });

  it('makes landscape sheets, two sides per sheet', async () => {
    const out = await PDFDocument.load(await bookletPdf(await make(8), 'a4', false));
    expect(out.getPageCount()).toBe(4);
    expect(Math.round(out.getPage(0).getWidth())).toBe(842);
  });
});

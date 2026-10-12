// @vitest-environment node
import { PDFDocument, degrees } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { complement, cropPdf, extractPdfPages, marginsForRotation, repairPdf, splitGroups, splitPdf } from './pdftools';

async function sample(n: number, size: [number, number] = [300, 400]) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([size[0] + i, size[1]]); // different widths tell the pages apart
  return doc.save();
}
const widths = async (b: Uint8Array) => (await PDFDocument.load(b)).getPages().map((p) => Math.round(p.getWidth()));

describe('split, extract, crop, repair', () => {
  it('extracts pages in the order given', async () => {
    expect(await widths(await extractPdfPages(await sample(5), [3, 0]))).toEqual([303, 300]);
  });
  it('finds the pages to keep when removing', () => {
    expect(complement(5, [1, 3])).toEqual([0, 2, 4]);
    expect(complement(2, [0, 1])).toEqual([]);
  });
  it('plans a split', () => {
    expect(splitGroups(5, { kind: 'each' })).toEqual([[0], [1], [2], [3], [4]]);
    expect(splitGroups(5, { kind: 'every', n: 2 })).toEqual([[0, 1], [2, 3], [4]]);
    expect(splitGroups(5, { kind: 'ranges', text: '1-2, 4' })).toEqual([[0, 1], [3]]);
    expect(splitGroups(5, { kind: 'ranges', text: '1-9' })).toBeNull();
    expect(splitGroups(5, { kind: 'every', n: 0 })).toBeNull();
    expect(splitGroups(5, { kind: 'ranges', text: '' })).toBeNull();
  });
  it('writes one file per group with readable names', async () => {
    const files = await splitPdf(await sample(5), 'My report.pdf', { kind: 'ranges', text: '1-2, 5' });
    expect(files.map((f) => f.name)).toEqual(['My report-pages-1-2.pdf', 'My report-page-5.pdf']);
    expect(await widths(files[0].bytes)).toEqual([300, 301]);
    expect(await widths(files[1].bytes)).toEqual([304]);
  });
  it('turns margins as seen into margins of the stored page', () => {
    const m = { top: 1, right: 2, bottom: 3, left: 4 };
    expect(marginsForRotation(m, 0)).toEqual(m);
    expect(marginsForRotation(m, 90)).toEqual({ left: 1, top: 2, right: 3, bottom: 4 });
    expect(marginsForRotation(m, 180)).toEqual({ left: 2, right: 4, top: 3, bottom: 1 });
    expect(marginsForRotation(m, 270)).toEqual({ left: 3, top: 4, right: 1, bottom: 2 });
    expect(marginsForRotation(m, -90)).toEqual(marginsForRotation(m, 270));
  });
  it('crops the chosen pages only, and the page really gets smaller', async () => {
    const out = await cropPdf(await sample(3), { top: 10, right: 20, bottom: 30, left: 40 }, [1]);
    const pages = (await PDFDocument.load(out)).getPages();
    expect(pages[0].getSize()).toEqual({ width: 300, height: 400 });
    expect(pages[1].getSize()).toEqual({ width: 301 - 60, height: 400 - 40 });
    expect(pages[1].getCropBox()).toMatchObject({ x: 40, y: 30 });
  });
  it('crops a rotated page by what the reader sees', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]).setRotation(degrees(90));
    const out = await cropPdf(await doc.save(), { top: 50, right: 0, bottom: 0, left: 0 }, null);
    // seen from above, "top" of a page turned 90° clockwise is the stored left edge
    expect((await PDFDocument.load(out)).getPage(0).getCropBox()).toMatchObject({ x: 50, width: 250 });
  });
  it('refuses margins that leave nothing', async () => {
    await expect(cropPdf(await sample(1), { top: 200, right: 0, bottom: 200, left: 0 }, null)).rejects.toThrow(/too large/);
  });
  it('repairs by copying pages, and uses the fallback only when copying is impossible', async () => {
    const ok = await repairPdf(await sample(3));
    expect(ok).toMatchObject({ how: 'copy', pages: 3, skipped: 0 });
    const garbage = new TextEncoder().encode('%PDF-1.4\nnot really a pdf');
    await expect(repairPdf(garbage)).rejects.toThrow('unrecoverable');
    const viaFallback = await repairPdf(garbage, async () => sample(2));
    expect(viaFallback).toMatchObject({ how: 'pictures', pages: 2 });
  });
});

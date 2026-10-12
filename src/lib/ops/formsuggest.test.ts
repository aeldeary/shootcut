// @vitest-environment node
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initNodeEnv } from '../../test/node';
import { openPreview } from '../pdf';
import { analyzeDocument } from './formsuggest';

vi.mock('pdfjs-dist', async () => ({ ...(await import('pdfjs-dist/legacy/build/pdf.mjs')), GlobalWorkerOptions: {} }));
beforeAll(initNodeEnv);

async function page(draw: (p: ReturnType<PDFDocument['addPage']>, font: Awaited<ReturnType<PDFDocument['embedFont']>>) => void) {
  const doc = await PDFDocument.create();
  const p = doc.addPage([595, 842]);
  draw(p, await doc.embedFont(StandardFonts.Helvetica));
  return doc.save();
}
const line = (p: ReturnType<PDFDocument['addPage']>, x1: number, y1: number, x2: number, y2: number) =>
  p.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1, color: rgb(0, 0, 0) });

describe('analyzeDocument', () => {
  it('finds the empty cells of a table and leaves the labelled ones alone', async () => {
    const bytes = await page((p, font) => {
      // 2 columns x 4 rows, left column holds labels, right column is empty
      for (let r = 0; r <= 4; r++) line(p, 100, 700 - r * 40, 500, 700 - r * 40);
      for (const x of [100, 250, 500]) line(p, x, 700, x, 540);
      ['Name', 'Phone', 'Email', 'City'].forEach((t, i) => p.drawText(t, { x: 110, y: 675 - i * 40, size: 12, font }));
    });
    const preview = await openPreview(bytes);
    const out = await analyzeDocument(preview);
    preview.destroy();
    expect(out.kind).toBe('table');
    const cells = out.pages[0].suggestions.filter((s) => s.source === 'cell');
    expect(cells).toHaveLength(4);
    for (const c of cells) {
      expect(c.rect.x).toBeGreaterThan(245);
      expect(c.rect.width).toBeGreaterThan(200);
    }
    expect(cells.map((c) => c.label).sort()).toEqual(['City', 'Email', 'Name', 'Phone']);
  });

  it('suggests a field on an underscore line and beside a colon label, and nothing on plain text', async () => {
    const bytes = await page((p, font) => {
      p.drawText('Full name: ______________________', { x: 80, y: 700, size: 12, font });
      p.drawText('Date:', { x: 80, y: 650, size: 12, font });
      p.drawText('This paragraph is only text and has no blanks to fill in at all.', { x: 80, y: 600, size: 12, font });
    });
    const preview = await openPreview(bytes);
    const out = await analyzeDocument(preview);
    preview.destroy();
    expect(out.kind).toBe('lines');
    const s = out.pages[0].suggestions;
    expect(s.some((x) => x.source === 'blank' && x.rect.y > 694 && x.rect.y < 702)).toBe(true);
    expect(s.some((x) => x.source === 'label' && x.label === 'Date' && x.rect.x > 100)).toBe(true);
    expect(s.every((x) => !(x.rect.y > 590 && x.rect.y < 615))).toBe(true);
  });

  it('suggests a field above a ruled line, and a check box for a small square', async () => {
    const bytes = await page((p, font) => {
      line(p, 100, 500, 400, 500);
      p.drawText('Signature', { x: 100, y: 485, size: 10, font });
      p.drawRectangle({ x: 100, y: 400, width: 12, height: 12, borderColor: rgb(0, 0, 0), borderWidth: 1 });
      p.drawText('I agree', { x: 120, y: 402, size: 11, font });
    });
    const preview = await openPreview(bytes);
    const out = await analyzeDocument(preview);
    preview.destroy();
    const s = out.pages[0].suggestions;
    expect(s.some((x) => x.source === 'line' && x.rect.y >= 498 && x.rect.width > 250)).toBe(true);
    expect(s.some((x) => x.kind === 'checkbox')).toBe(true);
  });

  it('says there is nothing to suggest for a page of plain text', async () => {
    const bytes = await page((p, font) => p.drawText('Just a sentence on a page.', { x: 80, y: 700, size: 12, font }));
    const preview = await openPreview(bytes);
    const out = await analyzeDocument(preview);
    preview.destroy();
    expect(out.kind).toBe('none');
  });
});

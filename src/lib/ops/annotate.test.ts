// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initNodeEnv } from '../../test/node';
import { openPreview } from '../pdf';
import { annotatePdf } from './annotate';

vi.mock('pdfjs-dist', async () => ({ ...(await import('pdfjs-dist/legacy/build/pdf.mjs')), GlobalWorkerOptions: {} }));
beforeAll(initNodeEnv);
const dir = mkdtempSync(join(tmpdir(), 'sc-'));

async function sample() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 300]).drawText('Highlight me please', { x: 50, y: 200, size: 20, font });
  return doc.save();
}

describe('annotatePdf', () => {
  it('adds highlight, underline, strikeout and note annotations that other readers understand', async () => {
    const out = await annotatePdf(
      await sample(),
      [
        { kind: 'highlight', page: 0, rects: [{ x: 50, y: 195, width: 100, height: 20 }], color: '#ffeb3b', comment: 'مهم جداً' },
        { kind: 'underline', page: 0, rects: [{ x: 50, y: 150, width: 100, height: 14 }], color: '#d32f2f' },
        { kind: 'strikeout', page: 0, rects: [{ x: 50, y: 120, width: 100, height: 14 }], color: '#1976d2' },
        { kind: 'note', page: 0, x: 300, y: 280, text: 'ملاحظة: راجع الرقم 2026', color: '#fff176' },
      ],
      'Ahmed',
    );
    const f = join(dir, 'a.pdf');
    writeFileSync(f, out);
    expect(execFileSync('qpdf', ['--check', f]).toString()).toContain('No syntax or stream encoding errors');

    // pdf.js reads them back as proper annotations with their text
    const preview = await openPreview(out);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: out.slice() }).promise;
    const annots = await (await doc.getPage(1)).getAnnotations();
    expect(annots.map((a: { subtype: string }) => a.subtype).sort()).toEqual(['Highlight', 'StrikeOut', 'Text', 'Underline']);
    const hl = annots.find((a: { subtype: string }) => a.subtype === 'Highlight');
    expect(hl.contentsObj.str).toBe('مهم جداً');
    expect(annots.find((a: { subtype: string }) => a.subtype === 'Text').contentsObj.str).toContain('2026');
    preview.destroy();

    // poppler draws them: yellow behind the text, text still visible; underline red
    execFileSync('pdftoppm', ['-r', '72', '-png', f, join(dir, 'a')]);
    const px = (x: number, y: number) => execFileSync('convert', [join(dir, 'a-1.png'), '-format', `%[pixel:p{${x},${y}}]`, 'info:']).toString();
    // PDF y=205 (middle of highlight) -> image y = 300-205 = 95 ; x=140 is right of the text end? text spans to ~190, use an empty spot inside the box
    expect(px(55, 95)).toMatch(/srgb\(255,23\d,\d+\)|srgb\(255,2[0-5]\d,\d+\)/);
    // the note icon is drawn near top-right
    expect(px(310, 30)).not.toMatch(/white|srgb\(255,255,255\)/);
  });

  it('does nothing harmful with empty rect lists', async () => {
    const out = await annotatePdf(await sample(), [{ kind: 'highlight', page: 0, rects: [], color: '#ffeb3b' }]);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });
});

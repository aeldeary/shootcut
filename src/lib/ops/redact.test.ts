// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initNodeEnv } from '../../test/node';
import { openPreview } from '../pdf';
import { redactPdf } from './redact';
import { findTextBoxes } from './textselect';

vi.mock('pdfjs-dist', async () => ({ ...(await import('pdfjs-dist/legacy/build/pdf.mjs')), GlobalWorkerOptions: {} }));
beforeAll(initNodeEnv);
const dir = mkdtempSync(join(tmpdir(), 'sc-'));
const write = (n: string, b: Uint8Array) => (writeFileSync(join(dir, n), b), join(dir, n));

async function sample(rotate = 0) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([400, 300]);
  p1.drawText('Public line one', { x: 40, y: 250, size: 16, font });
  p1.drawText('SSN 123-45-6789 secret', { x: 40, y: 200, size: 16, font });
  if (rotate) p1.setRotation(degrees(rotate));
  const p2 = doc.addPage([400, 300]);
  p2.drawText('Page two stays selectable', { x: 40, y: 250, size: 16, font });
  doc.setTitle('Contains 6789 in title');
  doc.setAuthor('Secret Author');
  return doc.save();
}
const decompressed = (f: string) => {
  const out = join(dir, 'q-' + Math.random().toString(36).slice(2) + '.pdf');
  execFileSync('qpdf', ['--qdf', '--object-streams=disable', f, out]);
  return readFileSync(out).toString('latin1');
};

describe('redactPdf', () => {
  it('removes the covered text from the file for good and blacks out the area', async () => {
    const input = await sample();
    // find the secret by searching, as the UI does
    const preview = await openPreview(input);
    const boxes = findTextBoxes(await preview.textItems(0), '123-45-6789').map((b) => ({ ...b, page: 0 }));
    preview.destroy();
    expect(boxes.length).toBe(1);

    const out = await redactPdf(input, boxes);
    const f = write('red.pdf', out);
    expect(execFileSync('qpdf', ['--check', f]).toString()).toContain('No syntax or stream encoding errors');

    // text on the redacted page is gone from extraction ...
    expect(execFileSync('pdftotext', ['-f', '1', '-l', '1', f, '-']).toString().trim()).toBe('');
    // ... and from the raw file: even decompressed there is no trace of it, nor of the other text on that page
    const raw = decompressed(f);
    for (const needle of ['6789', 'secret', 'Public line', 'Secret Author', 'Contains']) expect(raw).not.toContain(needle);

    // the box is solid black in the render, the rest of the page is still visible
    execFileSync('pdftoppm', ['-r', '72', '-png', '-f', '1', '-l', '1', f, join(dir, 'red')]);
    const img = join(dir, 'red-1.png');
    const px = (x: number, y: number) => execFileSync('convert', [img, '-format', `%[pixel:p{${x},${y}}]`, 'info:']).toString();
    expect(px(Math.round(boxes[0].x + boxes[0].width / 2), 300 - Math.round(boxes[0].y + boxes[0].height / 2))).toMatch(/black|srgb\(0,0,0\)|gray\(0\)|srgb\(\d,\d,\d\)/);
    // untouched pages keep real text
    expect(execFileSync('pdftotext', ['-f', '2', '-l', '2', f, '-']).toString()).toContain('Page two stays selectable');
    expect(execFileSync('pdfinfo', [f]).toString()).toMatch(/Pages:\s+2/);
    expect(execFileSync('pdfinfo', [f]).toString()).toMatch(/Page size:\s+400 x 300/);
  });

  it('puts the box in the right place on a rotated page', async () => {
    const input = await sample(90);
    const out = await redactPdf(input, [{ page: 0, x: 40, y: 195, width: 250, height: 22 }], { stripMetadata: false });
    const f = write('rot.pdf', out);
    expect(execFileSync('pdftotext', ['-f', '1', '-l', '1', f, '-']).toString().trim()).toBe('');
    execFileSync('pdftoppm', ['-r', '72', '-png', '-f', '1', '-l', '1', f, join(dir, 'rot')]);
    // page shows 300 wide x 400 tall (rotated 90 deg clockwise): user (x,y) -> view (y, x)... compare with an unrotated reference render
    const dark = (x: number, y: number, w: number, h: number) => Number(execFileSync('convert', [join(dir, 'rot-1.png'), '-crop', `${w}x${h}+${x}+${y}`, '+repage', '-colorspace', 'gray', '-threshold', '10%', '-negate', '-format', '%[fx:mean]', 'info:']).toString());
    // rotate 90 cw: user (x,y) -> view (y, W - x) with W = 400 -> box covers view x 195..217; image rows 40..290
    expect(dark(196, 50, 20, 230)).toBeGreaterThan(0.95);
    expect(dark(0, 0, 100, 100)).toBeLessThan(0.05);
  });

  it('refuses when there is nothing to redact', async () => {
    await expect(redactPdf(await sample(), [])).rejects.toThrow();
  });
});

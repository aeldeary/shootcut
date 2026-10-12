// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, degrees } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { initNodeEnv } from '../../test/node';
import { stampPdf } from './stamp';

beforeAll(initNodeEnv);
const dir = mkdtempSync(join(tmpdir(), 'sc-'));

async function blank(pages = 2, rotate = 0) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([400, 600]);
    if (rotate) p.setRotation(degrees(rotate));
  }
  return doc.save();
}
function raster(bytes: Uint8Array, name: string, page = 1) {
  const f = join(dir, `${name}.pdf`);
  writeFileSync(f, bytes);
  execFileSync('pdftoppm', ['-r', '72', '-png', '-f', String(page), '-l', String(page), f, join(dir, name)]);
  return execFileSync('ls', [dir]).toString().split('\n').filter((x) => x.startsWith(name) && x.endsWith('.png')).map((x) => join(dir, x))[0];
}
/** share of non-white pixels inside a rectangle given in top-left px coordinates */
function ink(png: string, x: number, y: number, w: number, h: number): number {
  const out = execFileSync('convert', [png, '-crop', `${w}x${h}+${x}+${y}`, '+repage', '-colorspace', 'gray', '-threshold', '95%', '-negate', '-format', '%[fx:mean]', 'info:']).toString();
  return Number(out);
}

describe('stampPdf', () => {
  it('stamps only the chosen pages and text is extractable (Arabic and English)', async () => {
    const out = await stampPdf(await blank(3), { kind: 'text', text: 'سري CONFIDENTIAL', pages: [1], position: 'center', rotation: 0, size: 40 });
    const f = join(dir, 's1.pdf');
    writeFileSync(f, out);
    const p = (n: number) => execFileSync('pdftotext', ['-f', String(n), '-l', String(n), f, '-']).toString();
    expect(p(1).trim()).toBe('');
    expect(p(2)).toContain('CONFIDENTIAL');
    expect(p(2)).toContain('سري');
    expect(p(3).trim()).toBe('');
  });

  it('puts a watermark where it was asked to (top vs bottom)', async () => {
    const top = raster(await stampPdf(await blank(1), { kind: 'text', text: 'DRAFT', position: 'top-center', rotation: 0, size: 40, opacity: 1, color: '#000000' }), 'top');
    expect(ink(top, 100, 20, 200, 80)).toBeGreaterThan(0.03);
    expect(ink(top, 100, 500, 200, 80)).toBe(0);
  });

  it('puts the stamp exactly where the person chose, not only on the 9 spots', async () => {
    const out = raster(await stampPdf(await blank(1), { kind: 'text', text: 'HI', position: 'custom', at: { x: 0.2, y: 0.7 }, rotation: 0, size: 40, opacity: 1, color: '#000000' }), 'custom');
    expect(ink(out, 50, 395, 60, 50)).toBeGreaterThan(0.05); // centre is about (80, 420) from the top-left
    expect(ink(out, 250, 395, 100, 50)).toBe(0);
    expect(ink(out, 50, 100, 60, 50)).toBe(0);
  });

  it('keeps the stamp upright on a page that is rotated 90 degrees', async () => {
    const out = await stampPdf(await blank(1, 90), { kind: 'text', text: 'TOP', position: 'top-center', rotation: 0, size: 40, opacity: 1, color: '#000000' });
    const png = raster(out, 'rot');
    // rotated page is shown 600x400; stamp sits at the top
    expect(ink(png, 200, 15, 200, 70)).toBeGreaterThan(0.03);
    expect(ink(png, 200, 320, 200, 70)).toBe(0);
    // and reads left-to-right (pdftotext sees it unrotated in the viewer's frame)
    const f = join(dir, 'rot.pdf');
    expect(execFileSync('pdftotext', [f, '-']).toString()).toContain('TOP');
  });

  it('adds page numbers with the total', async () => {
    const out = await stampPdf(await blank(3), { kind: 'numbers', text: 'Page {n} of {total}' });
    const f = join(dir, 'n.pdf');
    writeFileSync(f, out);
    expect(execFileSync('pdftotext', ['-f', '3', '-l', '3', f, '-']).toString()).toContain('Page 3 of 3');
  });

  it('places an image stamp', async () => {
    const c = createCanvas(100, 50);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 100, 50);
    const out = await stampPdf(await blank(1), { kind: 'image', image: { bytes: new Uint8Array(await c.encode('png')), mime: 'image/png' }, imageWidth: 100, position: 'bottom-right', rotation: 0, opacity: 1 });
    const png = raster(out, 'img');
    expect(ink(png, 264, 514, 100, 50)).toBeGreaterThan(0.9);
    expect(ink(png, 0, 0, 200, 200)).toBe(0);
  });

  it('tiles a watermark over the whole page', async () => {
    const png = raster(await stampPdf(await blank(1), { kind: 'text', text: 'COPY', position: 'tile', size: 30, opacity: 1, color: '#000000', rotation: 0 }), 'tile');
    for (const [x, y] of [[0, 0], [200, 0], [0, 300], [200, 300]]) expect(ink(png, x, y, 200, 300)).toBeGreaterThan(0.005);
  });

  it('validates input', async () => {
    await expect(stampPdf(await blank(1), { kind: 'text', text: '  ' })).rejects.toThrow();
    await expect(stampPdf(await blank(1), { kind: 'image' })).rejects.toThrow();
  });
});

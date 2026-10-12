// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { initNodeEnv } from '../../test/node';
import { createPdf } from './create';

beforeAll(initNodeEnv);

async function png(w: number, h: number, color: string) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return new Uint8Array(await c.encode('png'));
}
async function jpg(w: number, h: number, color: string) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return new Uint8Array(await c.encode('jpeg', 90));
}
const tmp = () => mkdtempSync(join(tmpdir(), 'sc-'));

describe('createPdf', () => {
  it('makes one page per image and fits the image inside the margins', async () => {
    const out = await createPdf({
      images: [
        { bytes: await png(1000, 500, '#ff0000'), mime: 'image/png' },
        { bytes: await jpg(200, 300, '#0000ff'), mime: 'image/jpeg' },
      ],
      pageSize: 'a4',
      margin: 36,
    });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(595.28, 1);
    // rasterize page 1: red image is centered, margins stay white
    const dir = tmp();
    writeFileSync(join(dir, 'a.pdf'), out);
    execFileSync('pdftoppm', ['-r', '72', '-png', '-f', '1', '-l', '1', join(dir, 'a.pdf'), join(dir, 'p')]);
    const ppm = execFileSync('convert', [join(dir, 'p-1.png'), '-format', '%[pixel:p{297,421}]|%[pixel:p{5,5}]|%[pixel:p{297,100}]', 'info:']).toString();
    const [centre, corner] = ppm.split('|');
    expect(centre).toMatch(/srgb\(255,0,0\)|red/);
    expect(corner).toMatch(/white|srgb\(255,255,255\)/);
  });

  it('uses the image size when pageSize is "fit"', async () => {
    const out = await createPdf({ images: [{ bytes: await png(120, 80, '#00ff00'), mime: 'image/png' }], pageSize: 'fit' });
    const p = (await PDFDocument.load(out)).getPage(0).getSize();
    expect([p.width, p.height]).toEqual([120, 80]);
  });

  it('writes mixed Arabic/English text and paginates long text', async () => {
    const para = 'مرحبا بالعالم Hello World 2026-10-10. ';
    const out = await createPdf({ images: [], text: para.repeat(400), pageSize: 'a4' });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    const dir = tmp();
    writeFileSync(join(dir, 'a.pdf'), out);
    const txt = execFileSync('pdftotext', ['-f', '1', '-l', '1', join(dir, 'a.pdf'), '-']).toString();
    expect(txt).toContain('Hello');
    expect(txt).toContain('2026-10-10');
  });

  it('refuses to make an empty PDF', async () => {
    await expect(createPdf({ images: [], text: '  ' })).rejects.toThrow();
  });
});

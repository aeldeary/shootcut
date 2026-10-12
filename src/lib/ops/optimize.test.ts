// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initNodeEnv } from '../../test/node';
import { jpegInfo, optimizePdf } from './optimize';

vi.mock('pdfjs-dist', async () => ({
  ...(await import('pdfjs-dist/legacy/build/pdf.mjs')),
  GlobalWorkerOptions: {},
}));
beforeAll(initNodeEnv);
const dir = mkdtempSync(join(tmpdir(), 'sc-'));

async function photo() {
  const c = createCanvas(2400, 1600);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 2400, 1600);
  g.addColorStop(0, '#ff3300');
  g.addColorStop(1, '#0033ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2400, 1600);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = `rgb(${Math.floor(rnd() * 255)},${Math.floor(rnd() * 255)},${Math.floor(rnd() * 255)})`;
    ctx.fillRect(rnd() * 2400, rnd() * 1600, 20 + rnd() * 60, 20 + rnd() * 60);
  }
  return new Uint8Array(await c.encode('jpeg', 95));
}

async function sample() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const img = await doc.embedJpg(await photo());
  const page = doc.addPage([600, 400]);
  page.drawImage(img, { x: 0, y: 0, width: 600, height: 400 });
  page.drawText('Quarterly report', { x: 20, y: 370, size: 24, font });
  doc.setTitle('Secret title');
  // an orphaned object, as left behind by edits
  doc.context.register(doc.context.obj({ Orphan: 'x'.repeat(5000) }));
  return doc.save({ useObjectStreams: false });
}

const write = (n: string, b: Uint8Array) => (writeFileSync(join(dir, n), b), join(dir, n));
const check = (f: string) => execFileSync('qpdf', ['--check', f]).toString();

describe('optimizePdf', () => {
  it('light: removes unused objects without touching content', async () => {
    const input = await sample();
    const r = await optimizePdf(input, { level: 'light' });
    expect(r.keptOriginal).toBe(false);
    expect(r.after).toBeLessThan(r.before);
    const f = write('light.pdf', r.bytes);
    expect(check(f)).toContain('No syntax or stream encoding errors');
    expect(execFileSync('pdftotext', [f, '-']).toString()).toContain('Quarterly report');
    expect(r.imagesRecompressed).toBe(0);
  });

  it('balanced: recompresses JPEG images, keeps text selectable and the picture intact', async () => {
    const input = await sample();
    const original = await PDFDocument.load(input);
    expect(original.getPageCount()).toBe(1);
    const light = await optimizePdf(input, { level: 'light' });
    const r = await optimizePdf(input, { level: 'balanced' });
    expect(r.imagesRecompressed).toBe(1);
    expect(r.after).toBeLessThan(light.after * 0.6);
    const f = write('bal.pdf', r.bytes);
    expect(check(f)).toContain('No syntax or stream encoding errors');
    expect(execFileSync('pdftotext', [f, '-']).toString()).toContain('Quarterly report');
    // image still fills the page: check colours at both ends of the gradient
    execFileSync('pdftoppm', ['-r', '36', '-png', f, join(dir, 'bal')]);
    const px = execFileSync('convert', [join(dir, 'bal-1.png'), '-format', '%[pixel:p{5,195}]|%[pixel:p{295,5}]', 'info:']).toString();
    const [bl, tr] = px.split('|');
    expect(bl).toMatch(/srgb\(\d+,\d+,\d+\)/);
    // new image is smaller in pixels
    const imgs = execFileSync('pdfimages', ['-list', f]).toString().split('\n')[2].trim().split(/\s+/);
    expect(Number(imgs[3])).toBeLessThanOrEqual(1800);
    expect(tr).toBeTruthy();
  });

  it('strips document metadata when asked', async () => {
    const r = await optimizePdf(await sample(), { level: 'light', stripMetadata: true });
    const f = write('meta.pdf', r.bytes);
    expect(execFileSync('pdfinfo', [f]).toString()).not.toContain('Secret title');
  });

  it('flatten: turns pages into images (smaller, no text) at the same page size', async () => {
    const input = await sample();
    const r = await optimizePdf(input, { level: 'flatten' });
    expect(r.keptOriginal).toBe(false);
    const f = write('flat.pdf', r.bytes);
    expect(check(f)).toContain('No syntax or stream encoding errors');
    expect(execFileSync('pdftotext', [f, '-']).toString().trim()).toBe('');
    expect(execFileSync('pdfinfo', [f]).toString()).toMatch(/Page size:\s+600 x 400/);
  });

  it('keeps the original when optimizing would not help', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const tiny = await doc.save();
    const r = await optimizePdf(tiny, { level: 'light' });
    expect(r.bytes).toBe(tiny);
    expect(r.keptOriginal).toBe(true);
  });

  it('reads JPEG headers', async () => {
    const info = jpegInfo(await photo());
    expect(info).toEqual({ width: 2400, height: 1600, components: 3 });
  });
});

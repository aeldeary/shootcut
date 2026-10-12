// @vitest-environment node
import { PDFDocument, rgb } from 'pdf-lib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createCanvas as napi } from '@napi-rs/canvas';
import { initNodeEnv } from '../../test/node';
import { openPreview } from '../pdf';
import { applyPrintColor, commonOrientation, renderPrintPage } from './print';

vi.mock('pdfjs-dist', async () => ({ ...(await import('pdfjs-dist/legacy/build/pdf.mjs')), GlobalWorkerOptions: {} }));
beforeAll(initNodeEnv);

async function colourful() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 100]);
  page.drawRectangle({ x: 0, y: 0, width: 100, height: 100, color: rgb(1, 0, 0) });
  page.drawRectangle({ x: 100, y: 0, width: 100, height: 100, color: rgb(0.8, 0.8, 0.9) });
  return openPreview(await doc.save());
}

async function pixels(url: string) {
  const { loadImage } = await import('@napi-rs/canvas');
  const img = await loadImage(Buffer.from(url.split(',')[1], 'base64'));
  const c = napi(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const at = (fx: number, fy: number) => Array.from(ctx.getImageData(Math.floor(img.width * fx), Math.floor(img.height * fy), 1, 1).data);
  return { width: img.width, height: img.height, at };
}

describe('print colour modes', () => {
  it('keeps colours in colour mode', async () => {
    const p = await pixels((await renderPrintPage(await colourful(), 0, { color: 'color', dpi: 72 })).url);
    const [r, g, b] = p.at(0.25, 0.5);
    expect(r).toBeGreaterThan(240);
    expect(g).toBeLessThan(15);
    expect(b).toBeLessThan(15);
  });

  it('turns everything grey in grey mode', async () => {
    const p = await pixels((await renderPrintPage(await colourful(), 0, { color: 'gray', dpi: 72 })).url);
    const [r, g, b] = p.at(0.25, 0.5);
    expect(Math.abs(r - g)).toBeLessThan(6);
    expect(Math.abs(g - b)).toBeLessThan(6);
    expect(r).toBeGreaterThan(40);
    expect(r).toBeLessThan(110);
  });

  it('uses only black and white in black-and-white mode', async () => {
    const page = await renderPrintPage(await colourful(), 0, { color: 'bw', threshold: 170, dpi: 72 });
    expect(page.url.startsWith('data:image/png')).toBe(true);
    const p = await pixels(page.url);
    expect(p.at(0.25, 0.5).slice(0, 3)).toEqual([0, 0, 0]); // red is dark enough to print black
    expect(p.at(0.75, 0.5).slice(0, 3)).toEqual([255, 255, 255]); // light grey-blue prints white
    expect(page.width).toBe(200);
  });

  it('the cut-off decides what counts as dark', () => {
    const c = napi(1, 1);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgb(150,150,150)';
    ctx.fillRect(0, 0, 1, 1);
    applyPrintColor(c as never, 'bw', 100);
    expect(Array.from(ctx.getImageData(0, 0, 1, 1).data)[0]).toBe(255);
    ctx.fillStyle = 'rgb(150,150,150)';
    ctx.fillRect(0, 0, 1, 1);
    applyPrintColor(c as never, 'bw', 200);
    expect(Array.from(ctx.getImageData(0, 0, 1, 1).data)[0]).toBe(0);
  });

  it('picks a paper direction only when all pages agree', () => {
    expect(commonOrientation([{ width: 200, height: 100 }, { width: 300, height: 100 }])).toBe('landscape');
    expect(commonOrientation([{ width: 100, height: 200 }])).toBe('portrait');
    expect(commonOrientation([{ width: 100, height: 200 }, { width: 200, height: 100 }])).toBe('auto');
    expect(commonOrientation([])).toBe('auto');
  });
});

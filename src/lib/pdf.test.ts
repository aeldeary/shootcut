// @vitest-environment node
import { PDFDocument, rgb } from 'pdf-lib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { embedFonts } from './fonts';
import { createCanvas, openPreview } from './pdf';
import { drawLine } from './text';
import { initNodeEnv } from '../test/node';

vi.mock('pdfjs-dist', async () => ({
  ...(await import('pdfjs-dist/legacy/build/pdf.mjs')),
  GlobalWorkerOptions: {},
}));

beforeAll(initNodeEnv);

async function samplePdf() {
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc);
  const page = doc.addPage([300, 200]);
  page.drawRectangle({ x: 50, y: 100, width: 60, height: 40, color: rgb(1, 0, 0) });
  drawLine(page, 'Hello 123', { x: 150, y: 60, size: 20, fonts });
  doc.addPage([200, 300]);
  return doc.save();
}

describe('preview helpers (pdf.js in Node)', () => {
  it('reports pages and sizes', async () => {
    const preview = await openPreview(await samplePdf());
    expect(preview.numPages).toBe(2);
    expect(await preview.pageSize(0)).toEqual({ width: 300, height: 200 });
    expect(await preview.pageSize(1)).toEqual({ width: 200, height: 300 });
    preview.destroy();
  });

  it('renders a page and maps PDF coordinates to pixels', async () => {
    const preview = await openPreview(await samplePdf());
    const scale = 2;
    const canvas = createCanvas(10, 10);
    await preview.renderToCanvas(0, canvas, scale);
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(400);

    const vp = await preview.viewport(0, scale);
    const ctx = canvas.getContext('2d');
    const px = (pdfX: number, pdfY: number) => {
      const [vx, vy] = vp.toView(pdfX, pdfY);
      return Array.from(ctx.getImageData(Math.round(vx), Math.round(vy), 1, 1).data) as number[];
    };
    // inside the red rectangle (PDF origin is bottom-left)
    expect(px(80, 120)).toEqual([255, 0, 0, 255]);
    // empty area is white
    expect(px(250, 150)).toEqual([255, 255, 255, 255]);
    // pixel -> pdf round trip
    const [vx, vy] = vp.toView(80, 120);
    const [bx, by] = vp.toPdf(vx, vy);
    expect(bx).toBeCloseTo(80, 3);
    expect(by).toBeCloseTo(120, 3);
    preview.destroy();
  });

  it('extracts text with positions in PDF space', async () => {
    const preview = await openPreview(await samplePdf());
    const items = await preview.textItems(0);
    const hello = items.find((i) => i.str.includes('Hello'));
    expect(hello).toBeTruthy();
    expect(hello!.x).toBeCloseTo(150, 0);
    expect(hello!.y).toBeCloseTo(60, 0);
    expect(hello!.width).toBeGreaterThan(40);
    preview.destroy();
  });

  it('produces a JPEG thumbnail data URL', async () => {
    const preview = await openPreview(await samplePdf());
    const url = await preview.render(0, 150);
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(url.length).toBeGreaterThan(500);
    preview.destroy();
  });
});

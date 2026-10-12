// @vitest-environment node
import { PDFDocument, rgb } from 'pdf-lib';
import { unzipSync } from 'fflate';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initNodeEnv } from '../../test/node';
import { openPreview } from '../pdf';
import { exportImages, zipFiles } from './export';

vi.mock('pdfjs-dist', async () => ({
  ...(await import('pdfjs-dist/legacy/build/pdf.mjs')),
  GlobalWorkerOptions: {},
}));
beforeAll(initNodeEnv);

async function threePages() {
  const doc = await PDFDocument.create();
  for (const [i, c] of ([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const).entries()) {
    const p = doc.addPage([200 + i * 10, 100]);
    p.drawRectangle({ x: 0, y: 0, width: 400, height: 400, color: rgb(c[0], c[1], c[2]) });
  }
  return doc.save();
}

describe('exportImages', () => {
  it('renders selected pages at the requested dpi and zips them', async () => {
    const preview = await openPreview(await threePages());
    const files = await exportImages(preview, { format: 'png', dpi: 144, pages: [0, 2], fileName: 'my doc.pdf' });
    expect(files.map((f) => f.name)).toEqual(['my doc-1.png', 'my doc-3.png']);
    // PNG signature and dimensions (IHDR): page 1 is 200x100pt -> 400x200px at 144 dpi
    const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset);
    expect(Array.from(files[0].bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect([dv(files[0].bytes).getUint32(16), dv(files[0].bytes).getUint32(20)]).toEqual([400, 200]);
    expect(dv(files[1].bytes).getUint32(16)).toBe(440);

    const zip = unzipSync(zipFiles(files));
    expect(Object.keys(zip).sort()).toEqual(['my doc-1.png', 'my doc-3.png']);
    expect(zip['my doc-1.png']).toEqual(files[0].bytes);
    preview.destroy();
  });

  it('writes JPEG when asked', async () => {
    const preview = await openPreview(await threePages());
    const [f] = await exportImages(preview, { format: 'jpeg', dpi: 72, pages: [1], fileName: 'a.pdf', quality: 0.8 });
    expect(f.name).toBe('a-2.jpg');
    expect(Array.from(f.bytes.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
    preview.destroy();
  });
});

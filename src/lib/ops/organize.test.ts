// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildOrganized } from './organize';

async function make(sizes: [number, number][]) {
  const d = await PDFDocument.create();
  sizes.forEach((s) => d.addPage(s));
  return d.save();
}
const sizesOf = async (b: Uint8Array) => (await PDFDocument.load(b)).getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);

describe('buildOrganized', () => {
  it('duplicates a page and keeps the order asked for', async () => {
    const main = await make([[100, 100], [200, 200], [300, 300]]);
    const out = await buildOrganized(main, [], [
      { src: 1, rotation: 0 },
      { src: 1, rotation: 0 },
      { src: 0, rotation: 0 },
    ]);
    expect(await sizesOf(out)).toEqual([[200, 200], [200, 200], [100, 100]]);
  });

  it('adds blank pages the size of their neighbour, and pages from another file', async () => {
    const main = await make([[100, 100], [200, 200]]);
    const other = await make([[400, 300]]);
    const out = await buildOrganized(main, [other], [
      { src: 0, rotation: 0 },
      { src: 0, blank: true, rotation: 0 },
      { from: 0, src: 0, rotation: 0 },
      { src: 1, rotation: 0 },
      { src: 0, blank: true, rotation: 0 },
    ]);
    expect(await sizesOf(out)).toEqual([[100, 100], [100, 100], [400, 300], [200, 200], [200, 200]]);
  });

  it('rotates and uses A4 for a lone blank page', async () => {
    const main = await make([[100, 200]]);
    const out = await buildOrganized(main, [], [{ src: 0, rotation: 90 }]);
    expect((await PDFDocument.load(out)).getPage(0).getRotation().angle).toBe(90);
    const lone = await buildOrganized(main, [], [{ src: 0, blank: true, rotation: 0 }]);
    expect(await sizesOf(lone)).toEqual([[595, 842]]);
  });
});
